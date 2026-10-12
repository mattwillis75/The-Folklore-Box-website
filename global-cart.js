(function() {
    function getCartKey() {
        return sessionStorage.getItem('wholesaleAuthenticated') === 'true' ? 'folkloreWholesaleCart' : 'folkloreCart';
    }

    // Safely update the nav links across the site
    function updateHeaderCartCount() {
        const cartKey = getCartKey();
        let cart = JSON.parse(localStorage.getItem(cartKey)) || [];
        let count = cart.reduce((total, item) => total + (item.quantity || 1), 0);
        
        const cartToggle = document.getElementById('cart-toggle');
        const mobileCartToggle = document.getElementById('mobile-cart-toggle');
        
        if (cartToggle) cartToggle.textContent = `Cart (${count})`;
        if (mobileCartToggle) mobileCartToggle.innerHTML = `Cart (<span id="mobile-cart-count">${count}</span>)`;
    }

    // Handles the "Add to Cart" button clicks and redirects to the cart page
    window.addToSmartCart = function(id, title, price, postalClass) {
        const cartKey = getCartKey();
        let cart = JSON.parse(localStorage.getItem(cartKey)) || [];
        let existingItem = cart.find(item => item.id === id);
        
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({ id, title, price, postalClass, quantity: 1 });
        }
        
        localStorage.setItem(cartKey, JSON.stringify(cart));
        
        // Immediately redirect the user to the new cart page!
        window.location.href = 'cart.html';
    };

    // Keep the wholesale logout functionality alive on shop.html
    const logoutBtn = document.getElementById('wholesale-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            let wCart = JSON.parse(localStorage.getItem('folkloreWholesaleCart')) || [];
            let rCart = JSON.parse(localStorage.getItem('folkloreCart')) || [];
            
            wCart.forEach(wItem => {
                let existingRItem = rCart.find(rItem => rItem.id === wItem.id);
                if (existingRItem) {
                    existingRItem.quantity += (wItem.quantity || 1);
                } else {
                    let retailPrice = Math.round((wItem.price / 0.60) * 100) / 100;
                    rCart.push({ id: wItem.id, title: wItem.title, price: retailPrice, postalClass: wItem.postalClass, quantity: wItem.quantity || 1 });
                }
            });

            localStorage.setItem('folkloreCart', JSON.stringify(rCart));
            localStorage.removeItem('folkloreWholesaleCart');
            sessionStorage.removeItem('wholesaleAuthenticated');
            
            alert("You have exited Wholesale Mode. Returning to the standard retail shop.");
            window.location.href = 'shop.html'; 
        });
    }

    // Run count on load
    document.addEventListener("DOMContentLoaded", updateHeaderCartCount);
    window.addEventListener('pageshow', updateHeaderCartCount);
})();
