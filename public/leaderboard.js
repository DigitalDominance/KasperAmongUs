// public/leaderboard.js
document.getElementById('backButton').addEventListener('click', () => {
  window.location.href = 'game.html';
});

async function fetchLeaderboard() {
  try {
    const response = await fetch('/api/leaderboard');
    const data = await response.json();
    if (data.success) {
      const listElem = document.getElementById('leaderboardList');
      listElem.innerHTML = '';
      data.players.forEach((player, index) => {
        const li = document.createElement('li');
        li.textContent = `${index + 1}. ${player.walletAddress.substring(0, 6)} - ${player.weeklyScore} pts`;
        listElem.appendChild(li);
      });
    } else {
      document.getElementById('leaderboardList').textContent = 'Failed to load leaderboard.';
    }
  } catch (err) {
    console.error(err);
    document.getElementById('leaderboardList').textContent = 'Error loading leaderboard.';
  }
}

fetchLeaderboard();
