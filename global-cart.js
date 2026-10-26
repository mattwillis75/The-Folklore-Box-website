document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Check permanent storage and update cart numbers everywhere
    function updateCartCount() {
        let cart = JSON.parse(localStorage.getItem('folkloreCart')) || [];
        let totalItems = 0;
        cart.forEach(item => { totalItems += (item.quantity || 1); });
        
        const desktopCount = document.getElementById('cart-count');
        const mobileCount = document.getElementById('mobile-cart-count');
        
        if (desktopCount) desktopCount.innerText = totalItems;
        if (mobileCount) mobileCount.innerText = totalItems;
    }

    // Run immediately on page load
    updateCartCount();

    // 2. Global Mobile Menu Toggle (Runs on every page)
    const mobileToggle = document.getElementById('mobile-toggle');
    const navList = document.getElementById('nav-list');
    
    if (mobileToggle && navList) {
        // Clone to safely remove any duplicate event listeners
        const newToggle = mobileToggle.cloneNode(true);
        mobileToggle.parentNode.replaceChild(newToggle, mobileToggle);
        
        newToggle.addEventListener('click', () => {
            navList.classList.toggle('mobile-active');
            newToggle.classList.toggle('open');
        });
    }

    // 3. Keep Cart Updated across tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'folkloreCart') {
            updateCartCount();
        }
    });
});
