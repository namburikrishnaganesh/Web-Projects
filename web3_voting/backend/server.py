from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime
import pytz
import sqlite3
import os

# ============================================================
# APP SETUP
# Creates the Flask app and allows requests from any origin
# (CORS needed because frontend and backend run on same machine)
# ============================================================
server = Flask(__name__)
CORS(server)
DB_NAME = "voting_database.db"

# ============================================================
# DATABASE CONNECTION
# Opens a connection to the SQLite database file
# Row factory lets us access columns by name (e.g. row["name"])
# ============================================================
def get_db():
    try:
        conn = sqlite3.connect(DB_NAME)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.Error as e:
        print(f"DB connection error: {e}")
        return None

# ============================================================
# DATABASE INITIALIZATION
# Creates the two tables if they don't already exist:
#   voters — stores registered voter IDs and names
#   votes  — stores each vote cast (who voted, for whom, when)
# Runs once automatically when the server starts
# ============================================================
def initialize_database():
    conn = get_db()
    if conn:
        cursor = conn.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS voters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voter_id TEXT UNIQUE,
            name TEXT
        )
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voter_id TEXT,
            candidate TEXT,
            time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        conn.commit()
        conn.close()

initialize_database()

# ============================================================
# GLOBAL STATE
# election_open controls whether voting is allowed
# candidates is the list of valid candidates voters can choose
# ============================================================
election_open = True
candidates = ["Alice", "Bob"]

# ============================================================
# HOME ROUTE
# Simple check to confirm the backend server is running
# Visit http://127.0.0.1:5000/ in browser to test
# ============================================================
@server.route("/")
def home():
    return jsonify({"message": "SQL Voting Backend Running"})

# ============================================================
# SERVE HTML PAGES
# These routes serve the frontend HTML files directly
# through Flask so we don't need a separate Live Server
#   /voting → opens voting_page.html for voters
#   /admin  → opens admin_dashboard.html for admin
#   /ui/... → serves all CSS, JS, and image files
# ============================================================
@server.route("/voting")
def voting_page():
    return send_from_directory(os.path.join("..", "ui"), "voting_page.html")

@server.route("/admin")
def admin_page():
    return send_from_directory(os.path.join("..", "ui", "admin"), "admin_dashboard.html")

@server.route("/ui/<path:filename>")
def static_files(filename):
    return send_from_directory(os.path.join("..", "ui"), filename)

# ============================================================
# REGISTER VOTER
# POST /register_voter
# Accepts { voter_id, name } and adds a new voter to the DB
# Returns error if voter ID is already registered
# ============================================================
@server.route("/register_voter", methods=["POST"])
def register_voter():
    data = request.get_json()
    voter_id = data.get("voter_id")
    name = data.get("name")
    if not voter_id or not name:
        return jsonify({"error": "Voter ID or name missing"}), 400
    conn = get_db()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO voters(voter_id, name) VALUES(?, ?)", (voter_id, name))
        conn.commit()
        return jsonify({"message": f"Voter {name} registered successfully"})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Voter ID already registered"}), 400
    finally:
        conn.close()

# ============================================================
# LOGIN VOTER
# POST /login_voter
# Accepts { voter_id } and checks if voter exists in the DB
# Returns voter name on success, error if not found
# ============================================================
@server.route("/login_voter", methods=["POST"])
def login_voter():
    data = request.get_json()
    voter_id = data.get("voter_id")
    if not voter_id:
        return jsonify({"error": "Voter ID missing"}), 400
    conn = get_db()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM voters WHERE voter_id=?", (voter_id,))
    voter = cursor.fetchone()
    conn.close()
    if voter:
        return jsonify({"message": "Voter exists", "name": voter["name"]})
    else:
        return jsonify({"error": "Voter not registered"}), 400

# ============================================================
# CAST VOTE
# POST /vote
# Accepts { voter_id, candidate } and records the vote
# Checks: election must be open, voter must be registered,
#         voter must not have already voted
# ============================================================
@server.route("/vote", methods=["POST"])
def vote():
    global election_open
    if not election_open:
        return jsonify({"error": "Election is closed"}), 400
    data = request.get_json()
    voter_id = data.get("voter_id")
    candidate = data.get("candidate")
    if not voter_id or not candidate:
        return jsonify({"error": "Voter ID or candidate missing"}), 400
    if candidate not in candidates:
        return jsonify({"error": "Invalid candidate"}), 400
    conn = get_db()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM voters WHERE voter_id=?", (voter_id,))
    voter = cursor.fetchone()
    if not voter:
        conn.close()
        return jsonify({"error": "Voter not registered"}), 400
    cursor.execute("SELECT * FROM votes WHERE voter_id=?", (voter_id,))
    existing = cursor.fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "You have already voted!"}), 400
    cursor.execute("INSERT INTO votes(voter_id, candidate) VALUES(?, ?)", (voter_id, candidate))
    conn.commit()
    conn.close()
    return jsonify({"message": f"Vote for {candidate} recorded successfully"})

# ============================================================
# GET RESULTS
# GET /results
# Returns total vote count for each candidate
# Used by both voting page and admin dashboard to show live results
# ============================================================
@server.route("/results")
def results():
    conn = get_db()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor()
    cursor.execute("SELECT candidate, COUNT(*) as count FROM votes GROUP BY candidate")
    rows = cursor.fetchall()
    conn.close()
    results_data = {c: 0 for c in candidates}
    for r in rows:
        results_data[r["candidate"]] = r["count"]
    return jsonify(results_data)

# ============================================================
# VOTE HISTORY
# GET /history
# Returns all votes in descending order (newest first)
# Joins voters table to include voter name alongside voter ID
# Converts stored UTC time to Indian Standard Time (IST)
# ============================================================
@server.route("/history")
def history():
    conn = get_db()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    cursor = conn.cursor()
    cursor.execute("""
    SELECT votes.id, votes.voter_id, voters.name, votes.candidate, votes.time
    FROM votes
    JOIN voters ON votes.voter_id = voters.voter_id
    ORDER BY votes.id DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    local_tz = pytz.timezone("Asia/Kolkata")
    data = []
    for r in rows:
        try:
            utc_time = datetime.strptime(r["time"], "%Y-%m-%d %H:%M:%S")
            local_time = utc_time.replace(tzinfo=pytz.utc).astimezone(local_tz)
            formatted_time = local_time.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            formatted_time = r["time"]
        data.append({
            "id": r["id"],
            "voter_id": r["voter_id"],
            "name": r["name"],
            "candidate": r["candidate"],
            "time": formatted_time
        })
    return jsonify(data)

# ============================================================
# RESET ELECTION
# GET /reset_election
# Deletes all votes from the database so voting can start fresh
# Also resets the vote ID counter back to 1
# Keeps all registered voters intact — they don't need to re-register
# ============================================================
@server.route("/reset_election")
def reset_election():
    conn = get_db()
    if conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM votes")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name='votes'")
        conn.commit()
        conn.close()
    return jsonify({"message": "Election reset successfully. All voters can vote again."})

# ============================================================
# CLOSE ELECTION
# GET /close_election
# Sets election_open to False — no new votes accepted
# ============================================================
@server.route("/close_election")
def close_election():
    global election_open
    election_open = False
    return jsonify({"message": "Election is now CLOSED"})

# ============================================================
# OPEN ELECTION
# GET /open_election
# Sets election_open to True — voting is allowed again
# ============================================================
@server.route("/open_election")
def open_election():
    global election_open
    election_open = True
    return jsonify({"message": "Election is now OPEN"})

# ============================================================
# ELECTION STATUS
# GET /status
# Returns whether the election is currently open or closed
# Used by the voting page to enable/disable vote buttons
# ============================================================
@server.route("/status")
def status():
    return jsonify({"election_open": election_open})

# ============================================================
# RUN SERVER
# Starts the Flask development server on all network interfaces
# Port 5000 — access at http://127.0.0.1:5000
# Debug mode on — auto-restarts when you save changes
# ============================================================
if __name__ == "__main__":
    server.run(host="0.0.0.0", port=5000, debug=True)