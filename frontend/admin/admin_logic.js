// ============================================================
// BACKEND API BASE URL
// All fetch requests point to this Flask server address
// Change this if the backend runs on a different port or host
// ============================================================
const backend = "http://127.0.0.1:5000"

// ============================================================
// CHART INSTANCE
// Holds the Chart.js object so we can update data in-place
// without destroying and redrawing the chart each time
// ============================================================
let voteChart;

// ============================================================
// LOAD RESULTS
// Fetches current vote counts for Alice and Bob from backend
// Then updates the bar chart, stat cards, and winner display
// Called once on page load and again every 3 seconds
// ============================================================
async function loadResults() {
    try {
        const response = await fetch(backend + "/results")
        const data = await response.json()
        const alice = data.Alice || 0
        const bob   = data.Bob   || 0
        updateChart(alice, bob)
        updateStats(alice, bob)
        updateWinner(alice, bob)
    } catch (err) {
        console.error("Error loading results:", err)
    }
}

// ============================================================
// UPDATE WINNER
// Reads vote counts and renders the winner row with animation
// Trophy emoji gets its own span so CSS can animate it
// independently from the candidate name shimmer text
// Shows a neutral message if votes are tied or both zero
// ============================================================
function updateWinner(alice, bob) {
    const el = document.getElementById("winnerText")
    if (alice === 0 && bob === 0) {
        el.innerHTML = '<span class="winner-name">No votes yet</span>'
        return
    }
    if (alice === bob) {
        el.innerHTML = '<span class="winner-name">Tie — no winner yet</span>'
        return
    }
    const name = alice > bob ? "Alice" : "Bob"
    el.innerHTML =
        '<span class="trophy">🏆</span>' +
        '<span class="winner-name">' + name + ' is Winning</span>'
}

// ============================================================
// UPDATE STATS
// Calculates each candidate's percentage share of total votes
// Then writes the vote count and percentage into the stat cards
// Handles the zero-total case to avoid dividing by zero
// ============================================================
function updateStats(alice, bob) {
    const total        = alice + bob
    const alicePercent = total > 0 ? ((alice / total) * 100).toFixed(1) : 0
    const bobPercent   = total > 0 ? ((bob   / total) * 100).toFixed(1) : 0
    const aliceEl  = document.getElementById("statAliceVotes")
    const bobEl    = document.getElementById("statBobVotes")
    const alicePct = document.getElementById("statAlicePercent")
    const bobPct   = document.getElementById("statBobPercent")
    if (aliceEl)  aliceEl.innerText  = alice
    if (bobEl)    bobEl.innerText    = bob
    if (alicePct) alicePct.innerText = alicePercent + "%"
    if (bobPct)   bobPct.innerText   = bobPercent   + "%"
}

// ============================================================
// UPDATE CHART
// If the chart already exists — updates the data and animates
// If the chart does not exist yet — creates it fresh with:
//   Gradient fills (cyan for Alice, orange for Bob)
//   Smooth easeInOutQuart animation on every update
//   Custom dark tooltip matching the dashboard theme
//   Subtle grid lines, no axis border, Rajdhani font labels
// ============================================================
function updateChart(aliceVotes, bobVotes) {
    const ctx = document.getElementById('voteChart').getContext('2d')

    // If chart already exists, just update data and re-animate
    if (voteChart) {
        voteChart.data.datasets[0].data = [aliceVotes, bobVotes]
        voteChart.update('active')
        return
    }

    // Create gradient fill for Alice bar (cyan top to deep blue bottom)
    const aliceGradient = ctx.createLinearGradient(0, 0, 0, 280)
    aliceGradient.addColorStop(0, 'rgba(0,198,255,0.9)')
    aliceGradient.addColorStop(1, 'rgba(0,119,170,0.3)')

    // Create gradient fill for Bob bar (orange top to dark red bottom)
    const bobGradient = ctx.createLinearGradient(0, 0, 0, 280)
    bobGradient.addColorStop(0, 'rgba(255,107,53,0.9)')
    bobGradient.addColorStop(1, 'rgba(204,68,17,0.3)')

    // Create the Chart.js bar chart with professional dark styling
    voteChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Alice', 'Bob'],
            datasets: [{
                label: 'Votes',
                data: [aliceVotes, bobVotes],
                backgroundColor: [aliceGradient, bobGradient],
                borderColor: ['rgba(0,198,255,0.8)', 'rgba(255,107,53,0.8)'],
                borderWidth: 1,
                borderRadius: 8,
                borderSkipped: false,
                barThickness: 80,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // Smooth animation every time data updates
            animation: {
                duration: 800,
                easing: 'easeInOutQuart'
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        font: { family: 'Rajdhani', size: 16, weight: '600' },
                        color: '#ffffff',
                        letterSpacing: '3px'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255,255,255,0.05)',
                        drawBorder: false
                    },
                    border: { display: false, dash: [4, 4] },
                    ticks: {
                        font: { family: 'Rajdhani', size: 13 },
                        color: '#a8bdd4',
                        stepSize: 1,
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: { display: false },
                // Custom tooltip — dark background, shows candidate and vote count
                tooltip: {
                    backgroundColor: 'rgba(13,19,32,0.95)',
                    borderColor: 'rgba(0,180,255,0.3)',
                    borderWidth: 1,
                    titleFont: { family: 'Rajdhani', size: 14, weight: '600' },
                    bodyFont:  { family: 'Rajdhani', size: 16 },
                    titleColor: '#a8bdd4',
                    bodyColor:  '#ffffff',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        title: (items) => items[0].label.toUpperCase(),
                        label: (item)  => `${item.raw} vote${item.raw !== 1 ? 's' : ''}`
                    }
                }
            }
        }
    })
}

// ============================================================
// LOAD HISTORY
// Fetches all cast votes from backend and populates the table
// Candidate name cell is colored — Alice in cyan, Bob in orange
// Clears and rewrites the tbody on every call to stay in sync
// ============================================================
async function loadHistory() {
    try {
        const response = await fetch(backend + "/history")
        const data     = await response.json()
        const tbody    = document.getElementById("historyTable").querySelector("tbody")
        tbody.innerHTML = ""
        data.forEach(vote => {
            const row            = document.createElement("tr")
            const candidateColor = vote.candidate === "Alice" ? "#00d4ff" : "#ff7043"
            row.innerHTML = `
                <td>${vote.id}</td>
                <td>${vote.voter_id}</td>
                <td>${vote.name}</td>
                <td style="color:${candidateColor}">${vote.candidate}</td>
                <td>${vote.time}</td>
            `
            tbody.appendChild(row)
        })
    } catch (err) {
        console.error("Error loading history:", err)
    }
}

// ============================================================
// RESET ELECTION
// Calls backend to delete all votes and reset the ID counter
// Clears localStorage and sessionStorage so voters can re-vote
// Then immediately refreshes the chart and history table
// ============================================================
async function resetElection() {
    try {
        const response = await fetch(backend + "/reset_election")
        const data     = await response.json()
        document.getElementById("adminOutput").innerText = data.message
        localStorage.clear()
        sessionStorage.clear()
        loadResults()
        loadHistory()
    } catch (err) {
        console.error("Error resetting election:", err)
    }
}

// ============================================================
// OPEN ELECTION
// Tells the backend to allow new votes to be submitted
// Shows a confirmation message and refreshes the status display
// ============================================================
async function openElection() {
    try {
        const response = await fetch(backend + "/open_election")
        const data     = await response.json()
        document.getElementById("adminOutput").innerText = data.message
        checkStatus()
    } catch (err) {
        console.error("Error opening election:", err)
    }
}

// ============================================================
// CLOSE ELECTION
// Tells the backend to block any new votes from being cast
// Shows a confirmation message and refreshes the status display
// ============================================================
async function closeElection() {
    try {
        const response = await fetch(backend + "/close_election")
        const data     = await response.json()
        document.getElementById("adminOutput").innerText = data.message
        checkStatus()
    } catch (err) {
        console.error("Error closing election:", err)
    }
}

// ============================================================
// CHECK STATUS
// Fetches the current election open/closed state from backend
// Updates the status text color: green = OPEN, red = CLOSED
// Called after open/close actions and on initial page load
// ============================================================
async function checkStatus() {
    try {
        const response = await fetch(backend + "/status")
        const data     = await response.json()
        const el       = document.getElementById("electionStatus")
        if (data.election_open) {
            el.innerText    = "Status: OPEN"
            el.style.color  = "#00ff88"
        } else {
            el.innerText    = "Status: CLOSED"
            el.style.color  = "#ff5252"
        }
    } catch (err) {
        console.error("Error checking status:", err)
    }
}

// ============================================================
// AUTO UPDATE
// Refreshes vote results and history table every 3 seconds
// Keeps the admin dashboard live without any manual action
// ============================================================
setInterval(loadResults, 3000)
setInterval(loadHistory, 3000)

// ============================================================
// INITIAL PAGE LOAD
// Runs once when the page first opens in the browser
// Fetches election status, current vote results, and history
// ============================================================
window.onload = function () {
    checkStatus()
    loadResults()
    loadHistory()
}