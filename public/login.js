// frontend/src/login.js

document.getElementById('loginButton').addEventListener('click', async () => {
  if (window.kasware) {
    try {
      const accounts = await window.kasware.requestAccounts();
      if (accounts && accounts.length > 0) {
        const walletAddress = accounts[0];
        console.log("Connected wallet:", walletAddress);
        // Save the wallet address for later use (for example, in game.html)
        localStorage.setItem('walletAddress', walletAddress);
        // Redirect to the game page
        window.location.href = 'game.html';
      } else {
        alert('No wallet accounts found.');
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert('There was an error connecting your wallet. Please try again.');
    }
  } else {
    alert('Please install KasWare Wallet to connect.');
  }
});
