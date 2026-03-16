// ============================================================
// BACKEND API BASE URL
// All fetch requests point to this Flask server address
// Change this if the backend runs on a different port or host
// ============================================================
const backend = "https://web3-voting-api.onrender.com"

// ============================================================
// TOAST NOTIFICATION
// Shows a small animated popup message at the bottom of screen
// type "success" → green toast   type "error" → red toast
// Auto-disappears after 3 seconds
// Styled by voting_style.css via toast-success / toast-error classes
// ============================================================
function showToast(message, type) {
    const existing = document.getElementById("toast")
    if (existing) existing.remove()
    const toast = document.createElement("div")
    toast.id = "toast"
    toast.innerText = message
    toast.className = type === "success" ? "toast-success" : "toast-error"
    document.body.appendChild(toast)
    requestAnimationFrame(() => toast.classList.add("toast-show"))
    setTimeout(() => {
        toast.classList.remove("toast-show")
        setTimeout(() => toast.remove(), 400)
    }, 3000)
}

// ============================================================
// LOGIN / REGISTER
// Called when the Login / Register button is clicked
// If name field is filled → registers a new voter
// If only voter ID is filled → logs in existing voter
// On success: saves voter ID to localStorage and refreshes results
// On error:   shows toast and status message
// ============================================================
async function loginOrRegister(event) {
    if (event) event.preventDefault()
    const voterId = document.getElementById("voterId").value
    const name    = document.getElementById("voterName").value
    if (voterId === "") {
        showToast("Enter Voter ID", "error")
        return
    }
    if (name !== "") {
        // Name provided — register new voter
        const response = await fetch(backend + "/register_voter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voter_id: voterId, name: name })
        })
        const data = await response.json()
        if (data.error) {
            document.getElementById("voterStatus").innerText = data.error
            showToast(data.error, "error")
        } else {
            document.getElementById("voterStatus").innerText = data.message
            showToast(data.message, "success")
            localStorage.setItem("voterId", voterId)
        }
    } else {
        // No name — login existing voter
        const response = await fetch(backend + "/login_voter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voter_id: voterId })
        })
        const data = await response.json()
        if (data.error) {
            document.getElementById("voterStatus").innerText = data.error
            showToast(data.error, "error")
        } else {
            document.getElementById("voterStatus").innerText = "Voter logged in successfully"
            showToast("Logged in successfully", "success")
            localStorage.setItem("voterId", voterId)
        }
    }
    await checkVoted()
    await loadResults()
}

// ============================================================
// CHECK ELECTION STATUS
// Fetches whether the election is currently open or closed
// If closed → shows message and disables all vote buttons
// If open   → runs checkVoted to see if this voter already voted
// Called on page load and every 3 seconds automatically
// ============================================================
async function checkStatus() {
    try {
        const response = await fetch(backend + "/status")
        const data     = await response.json()
        if (!data.election_open) {
            document.getElementById("output").innerText = "Election Closed - Voting Disabled"
            document.querySelectorAll("button.voteBtn").forEach(btn => btn.disabled = true)
        } else {
            checkVoted()
        }
    } catch (err) {
        console.error("Status check failed:", err)
    }
}

// ============================================================
// CAST VOTE
// Called when a voter clicks Vote for Alice or Vote for Bob
// Sends the voter ID and chosen candidate to the backend
// On success: saves voted flag to localStorage, shows toast
// On error:   shows error toast (e.g. already voted, not logged in)
// ============================================================
async function voteCandidate(name, event) {
    if (event) event.preventDefault()
    const voterId = localStorage.getItem("voterId") || document.getElementById("voterId").value
    if (!voterId) {
        showToast("Login first before voting", "error")
        return
    }
    const response = await fetch(backend + "/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: name, voter_id: voterId })
    })
    const data = await response.json()
    if (data.error) {
        showToast(data.error, "error")
        return
    }
    // Save voted flag so we don't re-check backend every 3 seconds
    localStorage.setItem("hasVoted_" + voterId, "true")
    showToast(data.message, "success")
    await loadResults()
}

// ============================================================
// UPDATE WINNER INDICATORS
// Reads current vote counts and updates the winner trophy spans
// Trophy emoji gets its own span so CSS can animate it
// independently from the candidate name shimmer text
// Shows "🏆 WINNER" next to the leading candidate only
// Clears both spans first to reset any previous state
// ============================================================
function updateWinner(alice, bob) {
    const aliceEl = document.getElementById("aliceWinner")
    const bobEl   = document.getElementById("bobWinner")
    aliceEl.innerHTML = ""
    bobEl.innerHTML   = ""
    if (alice === bob) return
    const winnerEl = alice > bob ? aliceEl : bobEl
    winnerEl.innerHTML =
        '<span class="trophy">🏆</span>' +
        '<span class="winner-label">WINNER</span>'
}

// ============================================================
// LOAD RESULTS
// Fetches live vote counts for Alice and Bob from the backend
// Updates vote count numbers, progress bars, percentages,
// and the animated winner trophy indicator
// Called on page load and every 3 seconds automatically
// ============================================================
async function loadResults() {
    try {
        const response = await fetch(backend + "/results")
        const data     = await response.json()
        const alice    = data.Alice || 0
        const bob      = data.Bob   || 0
        document.getElementById("aliceVotes").innerText = alice
        document.getElementById("bobVotes").innerText   = bob
        const total        = alice + bob
        const alicePercent = total > 0 ? (alice / total) * 100 : 0
        const bobPercent   = total > 0 ? (bob   / total) * 100 : 0
        // Animate progress bars to new widths
        document.getElementById("aliceBar").style.width = alicePercent + "%"
        document.getElementById("bobBar").style.width   = bobPercent   + "%"
        document.getElementById("alicePercent").innerText = " (" + alicePercent.toFixed(1) + "%)"
        document.getElementById("bobPercent").innerText   = " (" + bobPercent.toFixed(1)   + "%)"
        // Update animated winner trophy next to the leading candidate
        updateWinner(alice, bob)
    } catch (err) {
        console.error("Load results failed:", err)
    }
}

// ============================================================
// LOAD HISTORY
// Fetches all votes and displays them in the history box
// Shows Vote #, Candidate, and Time for each vote cast
// Called when voter clicks the "Show Vote History" button
// ============================================================
async function loadHistory() {
    try {
        const response = await fetch(backend + "/history")
        const data     = await response.json()
        let text = ""
        if (data.length === 0) text = "No votes recorded yet"
        data.forEach(vote => {
            text += "Vote #" + vote.id + "\n"
            text += "Candidate: " + vote.candidate + "\n"
            text += "Time: " + vote.time + "\n\n"
        })
        document.getElementById("historyBox").innerText = text
    } catch (err) {
        console.error("Load history failed:", err)
    }
}

// ============================================================
// CHECK VOTED
// Checks if the currently logged-in voter has already voted
// First checks localStorage (fast, no network call needed)
// If not found locally, checks vote history from backend
// Shows "You have already voted" in the output area if true
// ============================================================
async function checkVoted() {
    const voterId = localStorage.getItem("voterId")
    if (!voterId) return
    // Fast path — already flagged in localStorage, skip backend call
    if (localStorage.getItem("hasVoted_" + voterId) === "true") {
        document.getElementById("output").innerText = "You have already voted"
        return
    }
    // Fallback — check backend in case voter voted from another device
    try {
        const response = await fetch(backend + "/history")
        const data     = await response.json()
        const voted    = data.some(v => v.voter_id === voterId)
        if (voted) {
            localStorage.setItem("hasVoted_" + voterId, "true")
            document.getElementById("output").innerText = "You have already voted"
        }
    } catch (err) {
        console.error("Check voted failed:", err)
    }
}

// ============================================================
// INITIAL PAGE LOAD
// Runs once when the voting page first opens in the browser
// Restores logged-in voter state from localStorage if present
// Then fetches election status and current vote results
// ============================================================
window.onload = function () {
    const voterId = localStorage.getItem("voterId")
    if (voterId) {
        checkVoted()
    }
    checkStatus()
    loadResults()
}

// ============================================================
// AUTO UPDATE INTERVALS
// Refreshes vote results every 3 seconds so the page stays live
// checkStatus re-runs too so election open/close is caught fast
// No manual page refresh needed while the election is running
// ============================================================
setInterval(loadResults, 3000)
setInterval(checkStatus, 3000)