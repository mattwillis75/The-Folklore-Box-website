(async function initializeGlobalCart() {
    // 1. INJECT THE CENTRALIZED HTML
    try {
        const response = await fetch('cart-components.html', { cache: 'no-store' });
        if (!response.ok) throw new Error("Could not fetch cart components");
        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);
    } catch (e) {
        console.error("Failed to load global cart HTML.", e);
        return; 
    }

    // 2. INITIALIZE GLOBAL CART LOGIC
    const isWholesale = sessionStorage.getItem('wholesaleAuthenticated') === 'true';
    const cartKey = isWholesale ? 'folkloreWholesaleCart' : 'folkloreCart';
    let validDiscounts = {};
    let activeDiscount = JSON.parse(sessionStorage.getItem('folkloreDiscount')) || null;
    
    let cart = [];
    try {
        cart = JSON.parse(sessionStorage.getItem(cartKey)) || [];
        cart.forEach(item => { if(!item.quantity) item.quantity = 1; });
    } catch(e) { cart = []; }

    // Grab UI Elements
    const banner = document.getElementById('wholesale-banner');
    const cartHeaderTitle = document.getElementById('cart-title');
    const logoutBtn = document.getElementById('wholesale-logout-btn');
    
    const cartPanel = document.getElementById('cart-panel'); 
    const cartOverlay = document.getElementById('cart-overlay');
    
    const destSelect = document.getElementById('cart-destination');
    const cartWarning = document.getElementById('cart-warning');
    const cartItemsContainer = document.getElementById('cart-items');
    
    const cartSubtotalLabel = document.getElementById('cart-subtotal');
    const cartPostageLabel = document.getElementById('cart-shipping-cost');
    const cartFinalTotalLabel = document.getElementById('cart-total');
    
    const discountContainerElement = document.getElementById('discount-container');
    const discountInput = document.getElementById('discount-code');
    const discountMsg = document.getElementById('discount-msg');
    const paypalContainer = document.getElementById('paypal-button-container');

    const dtToggle = document.getElementById('cart-toggle');
    const mbToggle = document.getElementById('mobile-cart-toggle');
    const mbCount = document.getElementById('mobile-cart-count');

    // Global toggle functions
    window.openCart = () => { 
        if(cartPanel) cartPanel.classList.add('active'); 
        if(cartOverlay) cartOverlay.classList.add('active'); 
        document.body.style.overflow = 'hidden'; 
    };
    
    window.closeCart = () => { 
        if(cartPanel) cartPanel.classList.remove('active'); 
        if(cartOverlay) cartOverlay.classList.remove('active'); 
        document.body.style.overflow = ''; 
    };

    if (dtToggle) dtToggle.addEventListener('click', (e) => { e.preventDefault(); window.openCart(); });
    if (mbToggle) mbToggle.addEventListener('click', (e) => { e.preventDefault(); window.openCart(); });
    if (destSelect) destSelect.addEventListener('change', () => window.updateCartUI());

    // Apply Wholesale UI Overrides
    if (isWholesale) {
        if (banner) banner.style.display = 'flex'; 
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (cartHeaderTitle) cartHeaderTitle.textContent = 'Wholesale Cart';
        if (discountContainerElement) discountContainerElement.style.display = 'none';
        activeDiscount = null;
        sessionStorage.removeItem('folkloreDiscount');
    } else {
        if (discountContainerElement) discountContainerElement.style.display = 'flex';
        if (activeDiscount && discountInput) {
            discountInput.value = activeDiscount.code;
            if (discountMsg) { discountMsg.textContent = "Discount active!"; discountMsg.style.color = "#28a745"; }
        }
    }

    // Wholesale Logout Event
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            let wCart = JSON.parse(sessionStorage.getItem('folkloreWholesaleCart')) || [];
            let rCart = JSON.parse(sessionStorage.getItem('folkloreCart')) || [];
            
            wCart.forEach(wItem => {
                let existingRItem = rCart.find(rItem => (rItem.cartItemId || rItem.id) === (wItem.cartItemId || wItem.id));
                if (existingRItem) {
                    existingRItem.quantity += (wItem.quantity || 1);
                } else {
                    let retailPrice = Math.round((wItem.price / 0.60) * 100) / 100;
                    rCart.push({
                        id: wItem.id, cartItemId: wItem.cartItemId || wItem.id, title: wItem.title,
                        price: retailPrice, postalClass: wItem.postalClass, size: wItem.size || null, quantity: wItem.quantity || 1
                    });
                }
            });
            sessionStorage.setItem('folkloreCart', JSON.stringify(rCart));
            sessionStorage.removeItem('folkloreWholesaleCart');
            sessionStorage.removeItem('wholesaleAuthenticated');
            alert("You have exited Wholesale Mode. Returning to the standard retail shop.");
            window.location.href = 'shop.html'; 
        });
    }

    // Fetch Postal Data
    let postalRates = {}; 
    try {
        const postalResponse = await fetch('postal.txt', { cache: 'no-store' });
        if (postalResponse.ok) {
            const postalText = await postalResponse.text();
            postalText.split('---').forEach(block => {
                if(!block.trim()) return;
                let currentClass = ""; let rates = {};
                block.trim().split('\n').forEach(line => {
                    const sepIndex = line.indexOf(':');
                    if(sepIndex > -1) {
                        const key = line.slice(0, sepIndex).trim().toLowerCase();
                        const value = line.slice(sepIndex + 1).trim();
                        if(key === 'class') currentClass = value;
                        else if(key === 'uk base') rates.ukBase = parseFloat(value);
                        else if(key === 'uk additional') rates.ukAdd = parseFloat(value);
                        else if(key === 'int base') rates.intBase = parseFloat(value);
                        else if(key === 'int additional') rates.intAdd = parseFloat(value);
                    }
                });
                if(currentClass) postalRates[currentClass] = rates;
            });
        }
    } catch(e) { console.error("Could not load postal rates."); }

    // Fetch Discounts
    try {
        const discResponse = await fetch('discounts.txt', { cache: 'no-store' });
        if (discResponse.ok) {
            const discText = await discResponse.text();
            discText.split('\n').forEach(line => {
                const parts = line.split(':');
                if (parts.length === 2) validDiscounts[parts[0].trim().toUpperCase()] = parts[1].trim();
            });
        }
    } catch(e) { console.error("Could not load discount codes."); }

    // Global Functions
    window.applyDiscount = function() {
        if (isWholesale) return; 
        const input = document.getElementById('discount-code').value.trim().toUpperCase();
        if (!input) {
            activeDiscount = null; sessionStorage.removeItem('folkloreDiscount');
            if(discountMsg) discountMsg.textContent = "";
            window.updateCartUI(); return;
        }
        if (validDiscounts[input]) {
            const val = validDiscounts[input];
            if (val.startsWith('%')) activeDiscount = { code: input, type: 'percent', value: parseFloat(val.substring(1)) };
            else if (val.startsWith('-')) activeDiscount = { code: input, type: 'fixed', value: parseFloat(val.substring(1)) };
            sessionStorage.setItem('folkloreDiscount', JSON.stringify(activeDiscount));
            if(discountMsg) { discountMsg.textContent = "Discount applied!"; discountMsg.style.color = "#28a745"; }
        } else {
            activeDiscount = null; sessionStorage.removeItem('folkloreDiscount');
            if(discountMsg) { discountMsg.textContent = "Invalid discount code."; discountMsg.style.color = "var(--accent-red)"; }
        }
        window.updateCartUI();
    };

    window.addToCart = function(id, title, price, postalClass, size = null) {
        const cartItemId = size ? `${id}-${size}` : id;
        let existingItem = cart.find(item => (item.cartItemId || item.id) === cartItemId);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            let finalPrice = isWholesale ? Math.round(price * 0.60 * 100) / 100 : price;
            cart.push({ id, cartItemId, title, price: finalPrice, postalClass, size, quantity: 1 });
        }
        sessionStorage.setItem(cartKey, JSON.stringify(cart));
        window.updateCartUI();
        window.openCart();
    };

    window.updateQuantity = function(index, delta) {
        cart[index].quantity += delta;
        if (cart[index].quantity <= 0) cart.splice(index, 1);
        sessionStorage.setItem(cartKey, JSON.stringify(cart));
        window.updateCartUI();
    };

    window.removeFromCart = function(index) { 
        cart.splice(index, 1); 
        sessionStorage.setItem(cartKey, JSON.stringify(cart)); 
        window.updateCartUI(); 
    };

    window.updateCartUI = function() {
        if(!cartItemsContainer) return;
        cartItemsContainer.innerHTML = '';
        let itemsTotal = 0; let shippingTotal = 0; let finalTotal = 0; let cartItemCount = 0;
        
        if (cart.length === 0) {
            cartItemsContainer.innerHTML = `<p style="color: #777; font-style: italic; text-align: center; margin-top: 40px;">Your ${isWholesale ? 'wholesale ' : ''}cart is currently empty.</p>`;
            if (cartSubtotalLabel) cartSubtotalLabel.textContent = `£0.00`;
            if (cartPostageLabel) cartPostageLabel.textContent = `£0.00`;
            if (cartFinalTotalLabel) cartFinalTotalLabel.textContent = `£0.00`;
            
            if(dtToggle) dtToggle.textContent = `Cart (0)`;
            if(mbCount) mbCount.textContent = `0`;
            
            if (paypalContainer) paypalContainer.style.display = 'none';
            if (cartWarning) cartWarning.style.display = isWholesale ? 'block' : 'none';
            
            const existingDiscRow = document.getElementById('cart-discount-row-render');
            if (existingDiscRow) existingDiscRow.remove();
            return;
        }

        const dest = destSelect ? destSelect.value : 'uk';
        let maxBase = -1; let maxBaseItem = null;

        cart.forEach((item, index) => {
            const qty = item.quantity || 1;
            cartItemCount += qty; itemsTotal += item.price * qty;
            
            const sizeStr = item.size ? `<br><span style="font-size:0.85rem; color:#aaa;">Size: ${item.size}</span>` : '';
            cartItemsContainer.innerHTML += `
                <div class="cart-item">
                    <div class="cart-item-details">
                        <h4 class="cart-item-title">${item.title} ${sizeStr}</h4>
                        <p class="cart-item-meta" style="font-size:0.8rem; color:#888; margin:0;">£${item.price.toFixed(2)} each</p>
                    </div>
                    <div class="cart-qty-controls">
                        <button class="qty-btn" onclick="window.updateQuantity(${index}, -1)">-</button>
                        <span>${qty}</span>
                        <button class="qty-btn" onclick="window.updateQuantity(${index}, 1)">+</button>
                    </div>
                    <div class="cart-item-total">£${(item.price * qty).toFixed(2)}</div>
                    <button class="remove-btn" onclick="window.removeFromCart(${index})">&times;</button>
                </div>
            `;
            const rates = postalRates[item.postalClass];
            if(rates) {
                const baseRate = dest === 'uk' ? rates.ukBase : rates.intBase;
                if(baseRate > maxBase) { maxBase = baseRate; maxBaseItem = item; }
            }
        });

        let baseRateApplied = false;
        cart.forEach((item) => {
            const rates = postalRates[item.postalClass];
            if(rates) {
                const qty = item.quantity || 1;
                const baseRate = dest === 'uk' ? rates.ukBase : rates.intBase;
                const addRate = dest === 'uk' ? rates.ukAdd : rates.intAdd;
                if (maxBaseItem && item.cartItemId === maxBaseItem.cartItemId && !baseRateApplied) {
                    shippingTotal += baseRate + (addRate * (qty - 1)); baseRateApplied = true;
                } else { shippingTotal += addRate * qty; }
            }
        });

        let discountAmount = 0;
        if (activeDiscount && !isWholesale) {
            if (activeDiscount.type === 'percent') discountAmount = itemsTotal * (activeDiscount.value / 100);
            else discountAmount = activeDiscount.value;
            if (discountAmount > itemsTotal) discountAmount = itemsTotal; 
        }

        finalTotal = itemsTotal - discountAmount + shippingTotal;
        if (cartSubtotalLabel) cartSubtotalLabel.textContent = `£${itemsTotal.toFixed(2)}`;
        if (cartPostageLabel) cartPostageLabel.textContent = `£${shippingTotal.toFixed(2)}`;
        
        const existingDiscRow = document.getElementById('cart-discount-row-render');
        if (existingDiscRow) existingDiscRow.remove();

        if (discountAmount > 0 && !isWholesale) {
            const finalTotalRow = document.querySelector('.cart-final-total-row');
            if (finalTotalRow) {
                finalTotalRow.insertAdjacentHTML('beforebegin', `
                    <div class="cart-row cart-discount-row" id="cart-discount-row-render" style="display: flex; justify-content: space-between; color: #28a745; margin-bottom: 10px; font-family: 'Lato', sans-serif;">
                        <span>Discount (${activeDiscount.code}):</span><span>-£${discountAmount.toFixed(2)}</span>
                    </div>
                `);
            }
        }

        if (cartFinalTotalLabel) cartFinalTotalLabel.textContent = `£${finalTotal.toFixed(2)}`;
        if(dtToggle) dtToggle.textContent = `Cart (${cartItemCount})`;
        if(mbCount) mbCount.textContent = `${cartItemCount}`;

        if (isWholesale && cartWarning) {
            if (itemsTotal >= 75) {
                cartWarning.style.display = 'none';
                if (paypalContainer) { paypalContainer.classList.remove('paypal-disabled'); paypalContainer.style.display = 'block'; }
            } else {
                cartWarning.style.display = 'block';
                if (paypalContainer) { paypalContainer.classList.add('paypal-disabled'); paypalContainer.style.display = 'block'; }
            }
        } else {
            if (cartWarning) cartWarning.style.display = 'none';
            if (paypalContainer) { paypalContainer.classList.remove('paypal-disabled'); paypalContainer.style.display = 'block'; }
        }
    };

    // RUN THE RENDER IMMEDIATELY ON PAGE LOAD TO SYNC UI!
    window.updateCartUI();

    // Check if cart should auto-open
    if (sessionStorage.getItem('openCartOnLoad') === 'true') {
        sessionStorage.removeItem('openCartOnLoad');
        window.openCart();
    }

    // PAYPAL SDK LOGIC
    try {
        if (typeof paypal !== 'undefined' && document.getElementById('paypal-button-container')) {
            paypal.Buttons({
                style: { color: 'gold', shape: 'rect', label: 'checkout', layout: 'vertical' },
                createOrder: function(data, actions) {
                    let itemsTotal = 0; let shippingTotal = 0; let maxBase = -1; let maxBaseItem = null; 
                    const dest = destSelect ? destSelect.value : 'uk';
                    cart.forEach(item => {
                        const qty = item.quantity || 1; itemsTotal += item.price * qty;
                        const rates = postalRates[item.postalClass];
                        if(rates) {
                            const baseRate = dest === 'uk' ? rates.ukBase : rates.intBase;
                            if(baseRate > maxBase) { maxBase = baseRate; maxBaseItem = item; }
                        }
                    });

                    let baseRateApplied = false;
                    cart.forEach(item => {
                        const rates = postalRates[item.postalClass];
                        if(rates) {
                            const qty = item.quantity || 1;
                            const baseRate = dest === 'uk' ? rates.ukBase : rates.intBase;
                            const addRate = dest === 'uk' ? rates.ukAdd : rates.intAdd;
                            if (maxBaseItem && item.cartItemId === maxBaseItem.cartItemId && !baseRateApplied) {
                                shippingTotal += baseRate + (addRate * (qty - 1)); baseRateApplied = true;
                            } else { shippingTotal += addRate * qty; }
                        }
                    });
                    
                    const paypalItems = cart.map(item => {
                        return { name: item.title + (item.size ? ` (${item.size})` : ''), unit_amount: { currency_code: 'GBP', value: item.price.toFixed(2) }, quantity: (item.quantity || 1).toString() };
                    });

                    let discountAmount = 0;
                    if (activeDiscount && !isWholesale) {
                        if (activeDiscount.type === 'percent') discountAmount = itemsTotal * (activeDiscount.value / 100);
                        else discountAmount = activeDiscount.value;
                        if (discountAmount > itemsTotal) discountAmount = itemsTotal;
                    }

                    if (isWholesale && itemsTotal < 75) { alert("Minimum wholesale spend of £75 not met."); return; }

                    if (shippingTotal > 0) {
                        paypalItems.push({ name: `Postage & Packaging (${dest === 'uk' ? 'UK' : 'International'})`, unit_amount: { currency_code: 'GBP', value: shippingTotal.toFixed(2) }, quantity: "1" });
                        itemsTotal += shippingTotal; shippingTotal = 0; 
                    }

                    let finalTotal = itemsTotal - discountAmount + shippingTotal; 
                    if (finalTotal <= 0) { alert("Your cart is empty or the total is zero!"); return; }

                    return actions.order.create({
                        purchase_units: [{ amount: { currency_code: 'GBP', value: finalTotal.toFixed(2), breakdown: { item_total: { currency_code: 'GBP', value: itemsTotal.toFixed(2) }, shipping: { currency_code: 'GBP', value: shippingTotal.toFixed(2) }, discount: { currency_code: 'GBP', value: discountAmount.toFixed(2) }}}, items: paypalItems }]
                    });
                },
                onApprove: function(data, actions) {
                    return actions.order.capture().then(function(details) {
                        try {
                            let orderBreakdown = "";
                            cart.forEach(item => {
                                const itemTotal = (item.price * (item.quantity || 1)).toFixed(2);
                                const sizeStr = item.size ? ` (Size: ${item.size})` : '';
                                orderBreakdown += `${item.quantity || 1}x ${item.title}${sizeStr} - £${itemTotal}\n`;
                            });
                            
                            if (activeDiscount && !isWholesale) {
                                let discountAmount = 0;
                                let subtotal = cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
                                if (activeDiscount.type === 'percent') discountAmount = subtotal * (activeDiscount.value / 100);
                                else discountAmount = activeDiscount.value;
                                if (discountAmount > subtotal) discountAmount = subtotal;
                                if (discountAmount > 0) orderBreakdown += `\nDiscount Applied (${activeDiscount.code}): -£${discountAmount.toFixed(2)}\n`;
                            }

                            const templateParams = {
                                to_name: details.payer.name.given_name,
                                to_email: details.payer.email_address,
                                order_details: orderBreakdown,
                                shipping_cost: document.getElementById('cart-shipping-cost') ? document.getElementById('cart-shipping-cost').textContent : '£0.00',
                                total_paid: document.getElementById('cart-total') ? document.getElementById('cart-total').textContent.replace('Total: £', '') : '£0.00'
                            };

                            if (typeof emailjs !== 'undefined') emailjs.send('service_zmm27cb', 'template_ld7uqbh', templateParams).catch(err => console.error('Email failed...', err));
                        } catch (err) { console.error('EmailJS Error:', err); }

                        alert('Payment successful! We have received your order, ' + details.payer.name.given_name + ', and an email confirmation will be sent to you shortly.');
                        cart = []; activeDiscount = null; sessionStorage.removeItem('folkloreDiscount');
                        sessionStorage.setItem(cartKey, JSON.stringify(cart)); 
                        window.updateCartUI(); window.closeCart();
                    });
                }
            }).render('#paypal-button-container');
        }
    } catch (error) { console.warn("PayPal SDK could not initialize.", error); }
})();
