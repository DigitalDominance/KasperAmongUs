// public/login.js
document.getElementById('loginButton').addEventListener('click', async () => {
  try {
    // Assume Kasware wallet API is available as window.kasware
    const accounts = await window.kasware.getAccounts();
    if (accounts && accounts.length > 0) {
      const walletAddress = accounts[0];
      localStorage.setItem('walletAddress', walletAddress);
      window.location.href = 'game.html';
    }
  } catch (err) {
    console.error("Failed to connect wallet:", err);
    alert("Wallet connection failed. Please try again.");
  }
});
