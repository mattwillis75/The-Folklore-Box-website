(async function initializeGlobalCart() {
    // --- 1. CSS SCROLL FIX FOR PAYPAL OVERFLOW ---
    const scrollFix = document.createElement('style');
    scrollFix.innerHTML = `
        /* Force the main panel to be the only scrollable element */
        #cart-panel { overflow-y: auto !important; -webkit-overflow-scrolling: touch !important; }
        
        /* Prevent the items list from getting crushed by the PayPal iframe */
        #cart-items { flex: 1 0 auto !important; overflow-y: visible !important; min-height: min-content !important; }
        
        /* Keep the footer solid */
        .cart-footer { flex: 0 0 auto !important; }
    `;
    document.head.appendChild(scrollFix);

    // --- 2. INJECT THE CENTRALIZED HTML ---
    try {
        const response = await fetch('cart-components.html', { cache: 'no-store' });
        if (!response.ok) throw new Error("Could not fetch cart components");
        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);
    } catch (e) {
        console.error("Failed to load global cart HTML.", e);
        return; 
    }

    // --- 3. CLEANUP OLD CONFLICTING CARTS & INITIALIZE UNIFIED LOGIC ---
    localStorage.removeItem('folkloreWholesaleCart');
    sessionStorage.removeItem('folkloreWholesaleCart');

    const isWholesale = sessionStorage.getItem('wholesaleAuthenticated') === 'true';
    const cartKey = 'folkloreCart'; // WE NOW USE ONE UNIFIED CART FOR EVERYTHING
    let validDiscounts = {};
    let autoDiscount = null;
    let activeDiscount = JSON.parse(sessionStorage.getItem('folkloreDiscount')) || null;
    
    let cart = [];
    try {
        cart = JSON.parse(localStorage.getItem(cartKey)) || [];
        cart.forEach(item => { if(!item.quantity) item.quantity = 1; });
    } catch(e) { cart = []; }

    // Grab UI Elements
    const banner = document.getElementById('wholesale-banner');
    const cartHeaderTitle = document.getElementById('cart-title');
    const logoutBtn = document.getElementById('wholesale-logout-btn');
    
    const cartPanel = document.getElementById('cart-panel'); 
    const cartSidebar = document.getElementById('cart-sidebar'); 
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
        if(cartSidebar) cartSidebar.classList.add('open');
        if(cartOverlay) cartOverlay.classList.add('active'); 
        document.body.style.overflow = 'hidden'; 
    };
    
    window.closeCart = () => { 
        if(cartPanel) cartPanel.classList.remove('active'); 
        if(cartSidebar) cartSidebar.classList.remove('open');
        if(cartOverlay) cartOverlay.classList.remove('active'); 
        document.body.style.overflow = ''; 
    };

    if (dtToggle) dtToggle.addEventListener('click', (e) => { e.preventDefault(); window.openCart(); });
    if (mbToggle) mbToggle.addEventListener('click', (e) => { e.preventDefault(); window.openCart(); });
    if (cartOverlay) cartOverlay.addEventListener('click', window.closeCart);
    const closeBtn = document.getElementById('close-cart');
    if (closeBtn) closeBtn.addEventListener('click', window.closeCart);

    if (destSelect) destSelect.addEventListener('change', () => window.updateCartUI());

    // Apply Wholesale UI Overrides
    if (isWholesale) {
        if (banner) banner.style.display = 'flex'; 
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (cartHeaderTitle) cartHeaderTitle.textContent = 'Wholesale Cart';
        if (discountContainerElement) discountContainerElement.style.display = 'none';
        activeDiscount = null;
        sessionStorage.removeItem('folkloreDiscount');
    }

    // Wholesale Logout Event
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
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

    // Fetch Discount Data
    try {
        const discResponse = await fetch('discounts.txt', { cache: 'no-store' });
        if (discResponse.ok) {
            const discText = await discResponse.text();
            discText.split('\n').forEach(line => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const code = parts[0].trim().toUpperCase();
                    const valueStr = parts.slice(1).join(':').trim(); 
                    
                    if (code === 'AUTO') {
                        const valParts = valueStr.split(',');
                        const discStr = valParts[0].trim();
                        const minSpend = valParts.length > 1 ? parseFloat(valParts[1].trim()) : 0;
                        let type = 'fixed', val = 0;
                        if (discStr.startsWith('%')) { type = 'percent'; val = parseFloat(discStr.substring(1)); }
                        else if (discStr.startsWith('-')) { type = 'fixed'; val = parseFloat(discStr.substring(1)); }
                        autoDiscount = { type: type, value: val, minSpend: minSpend };
                    } else {
                        validDiscounts[code] = valueStr;
                    }
                }
            });
        }
    } catch(e) { console.error("Could not load discount codes."); }

    // Manual Discount Function
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
            const parts = val.split(',');
            const discStr = parts[0].trim();
            const minSpend = parts.length > 1 ? parseFloat(parts[1].trim()) : 0;

            if (discStr.startsWith('%')) {
                activeDiscount = { code: input, type: 'percent', value: parseFloat(discStr.substring(1)), minSpend: minSpend };
            } else if (discStr.startsWith('-')) {
                activeDiscount = { code: input, type: 'fixed', value: parseFloat(discStr.substring(1)), minSpend: minSpend };
            }
            sessionStorage.setItem('folkloreDiscount', JSON.stringify(activeDiscount));
        } else {
            activeDiscount = null; sessionStorage.removeItem('folkloreDiscount');
            if(discountMsg) { discountMsg.textContent = "Invalid discount code."; discountMsg.style.color = "#cc0000"; }
        }
        window.updateCartUI();
    };

    window.addToCart = function(id, title, price, postalClass, size = null) {
        const cartItemId = size ? `${id}-${size}` : id;
        let existingItem = cart.find(item => (item.cartItemId || item.id) === cartItemId);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            // WE ALWAYS STORE THE BASE RETAIL PRICE IN STORAGE.
            cart.push({ id, cartItemId, title, price: price, postalClass, size, quantity: 1 });
        }
        localStorage.setItem(cartKey, JSON.stringify(cart));
        window.updateCartUI();
        window.openCart();
    };

    window.updateQuantity = function(index, delta) {
        cart[index].quantity += delta;
        if (cart[index].quantity <= 0) cart.splice(index, 1);
        localStorage.setItem(cartKey, JSON.stringify(cart));
        window.updateCartUI();
    };

    window.removeFromCart = function(index) { 
        cart.splice(index, 1); 
        localStorage.setItem(cartKey, JSON.stringify(cart)); 
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
            const existingAutoBanner = document.getElementById('auto-promo-banner');
            if (existingAutoBanner) existingAutoBanner.remove();
            
            if (!isWholesale && discountContainerElement) discountContainerElement.style.display = 'flex';
            return;
        }

        const dest = destSelect ? destSelect.value : 'uk';
        let maxBase = -1; let maxBaseItem = null;

        cart.forEach((item, index) => {
            const qty = item.quantity || 1;
            
            // DYNAMIC WHOLESALE CALCULATION
            const displayPrice = isWholesale ? Math.round(item.price * 0.60 * 100) / 100 : item.price;
            
            cartItemCount += qty; 
            itemsTotal += displayPrice * qty;
            
            const sizeStr = item.size ? `<br><span style="font-size:0.85rem; color:#aaa;">Size: ${item.size}</span>` : '';
            cartItemsContainer.innerHTML += `
                <div class="cart-item">
                    <div class="cart-item-details">
                        <h4 class="cart-item-title">${item.title} ${sizeStr}</h4>
                        <p class="cart-item-meta" style="font-size:0.8rem; color:#888; margin:0;">£${displayPrice.toFixed(2)} each</p>
                    </div>
                    <div class="cart-qty-controls">
                        <button class="qty-btn" onclick="window.updateQuantity(${index}, -1)">-</button>
                        <span>${qty}</span>
                        <button class="qty-btn" onclick="window.updateQuantity(${index}, 1)">+</button>
                    </div>
                    <div class="cart-item-total">£${(displayPrice * qty).toFixed(2)}</div>
                    <button class="remove-btn" onclick="window.removeFromCart(${index})">&times;</button>
                </div>
            `;
            const rates = postalRates[item.postalClass];
            if(rates) {
                const baseRate = dest === 'uk' ? rates.ukBase : rates.intBase;
                if(baseRate > maxBase) { maxBase = baseRate; maxBaseItem = item; }
            }
        });

        // Calculate Shipping Rate
        if (isWholesale) {
            shippingTotal = 10.00;
        } else {
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
        }

        // Evaluate Promos
        let discountAmount = 0;
        let appliedDiscountName = "";
        
        const existingAutoBanner = document.getElementById('auto-promo-banner');
        if (existingAutoBanner) existingAutoBanner.remove();

        if (!isWholesale) {
            if (autoDiscount && itemsTotal >= autoDiscount.minSpend) {
                if (autoDiscount.type === 'percent') discountAmount = itemsTotal * (autoDiscount.value / 100);
                else discountAmount = autoDiscount.value;
                if (discountAmount > itemsTotal) discountAmount = itemsTotal;
                appliedDiscountName = "Launch Offer";
                
                if (discountContainerElement) discountContainerElement.style.display = 'none';
                if (discountMsg) discountMsg.textContent = ""; 
                
            } else {
                if (discountContainerElement) discountContainerElement.style.display = 'flex';
                
                if (autoDiscount && itemsTotal > 0 && itemsTotal < autoDiscount.minSpend) {
                    const difference = (autoDiscount.minSpend - itemsTotal).toFixed(2);
                    const offerStr = autoDiscount.type === 'percent' ? `${autoDiscount.value}% off` : `£${autoDiscount.value.toFixed(2)} off`;
                    
                    const finalTotalRow = document.querySelector('.cart-final-total-row');
                    if (finalTotalRow) {
                        finalTotalRow.insertAdjacentHTML('beforebegin', `
                            <div id="auto-promo-banner" style="background: rgba(40, 167, 69, 0.1); border: 1px solid #28a745; color: #28a745; padding: 10px; text-align: center; border-radius: 4px; margin-bottom: 15px; font-family: 'Lato', sans-serif; font-size: 0.85rem;">
                                Add <strong>£${difference}</strong> more to your cart to automatically get ${offerStr}!
                            </div>
                        `);
                    }
                }
                
                if (activeDiscount) {
                    const minSpend = activeDiscount.minSpend || 0;
                    if (itemsTotal < minSpend) {
                        if (discountMsg) {
                            discountMsg.textContent = `Spend £${(minSpend - itemsTotal).toFixed(2)} more to use code ${activeDiscount.code}.`;
                            discountMsg.style.color = "#cc0000";
                        }
                        discountAmount = 0;
                    } else {
                        if (discountMsg) {
                            discountMsg.textContent = "Discount applied!";
                            discountMsg.style.color = "#28a745";
                        }
                        if (activeDiscount.type === 'percent') discountAmount = itemsTotal * (activeDiscount.value / 100);
                        else discountAmount = activeDiscount.value;
                        if (discountAmount > itemsTotal) discountAmount = itemsTotal; 
                        appliedDiscountName = activeDiscount.code;
                    }
                } else if (discountInput && discountInput.value === "") {
                    if (discountMsg) discountMsg.textContent = "";
                }
            }
        }

        // Free Postage Check
        let isFreeShipping = (itemsTotal - discountAmount) > 100;
        if (isFreeShipping) {
            shippingTotal = 0;
        }

        finalTotal = itemsTotal - discountAmount + shippingTotal;
        if (cartSubtotalLabel) cartSubtotalLabel.textContent = `£${itemsTotal.toFixed(2)}`;
        
        if (cartPostageLabel) {
            if (isFreeShipping) {
                cartPostageLabel.innerHTML = `<span style="color: var(--accent-red); font-weight: bold;">FREE</span>`;
            } else {
                cartPostageLabel.textContent = `£${shippingTotal.toFixed(2)}`;
            }
        }
        
        const existingDiscRow = document.getElementById('cart-discount-row-render');
        if (existingDiscRow) existingDiscRow.remove();

        if (discountAmount > 0 && !isWholesale) {
            const finalTotalRow = document.querySelector('.cart-final-total-row');
            if (finalTotalRow) {
                finalTotalRow.insertAdjacentHTML('beforebegin', `
                    <div class="cart-row cart-discount-row" id="cart-discount-row-render" style="display: flex; justify-content: space-between; color: #28a745; margin-bottom: 10px; font-family: 'Lato', sans-serif;">
                        <span>Discount (${appliedDiscountName}):</span><span>-£${discountAmount.toFixed(2)}</span>
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

    window.updateCartUI();

    if (sessionStorage.getItem('openCartOnLoad') === 'true') {
        sessionStorage.removeItem('openCartOnLoad');
        window.openCart();
    }

    // PAYPAL SDK LOGIC
    try {
        if (typeof paypal !== 'undefined' && document.getElementById('paypal-button-container')) {
            paypal.Buttons({
                style: { color: 'gold', shape: 'rect', label: 'checkout', layout: 'vertical' },
                
                // NEW: Automatically scroll the panel down when PayPal expands!
                onClick: function() {
                    setTimeout(() => {
                        const panel = document.getElementById('cart-panel');
                        if(panel) panel.scrollTo({ top: panel.scrollHeight, behavior: 'smooth' });
                    }, 500);
                },

                createOrder: function(data, actions) {
                    let itemsTotal = 0; let shippingTotal = 0; let maxBase = -1; let maxBaseItem = null; 
                    const dest = destSelect ? destSelect.value : 'uk';
                    cart.forEach(item => {
                        const qty = item.quantity || 1; 
                        
                        // DYNAMIC WHOLESALE CALCULATION FOR PAYPAL
                        const displayPrice = isWholesale ? Math.round(item.price * 0.60 * 100) / 100 : item.price;
                        itemsTotal += displayPrice * qty;
                        
                        const rates = postalRates[item.postalClass];
                        if(rates) {
                            const baseRate = dest === 'uk' ? rates.ukBase : rates.intBase;
                            if(baseRate > maxBase) { maxBase = baseRate; maxBaseItem = item; }
                        }
                    });

                    if (isWholesale) {
                        shippingTotal = 10.00;
                    } else {
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
                    }
                    
                    const paypalItems = cart.map(item => {
                        const displayPrice = isWholesale ? Math.round(item.price * 0.60 * 100) / 100 : item.price;
                        return { name: item.title + (item.size ? ` (${item.size})` : ''), unit_amount: { currency_code: 'GBP', value: displayPrice.toFixed(2) }, quantity: (item.quantity || 1).toString() };
                    });

                    let discountAmount = 0;
                    if (!isWholesale) {
                        if (autoDiscount && itemsTotal >= autoDiscount.minSpend) {
                            if (autoDiscount.type === 'percent') discountAmount = itemsTotal * (autoDiscount.value / 100);
                            else discountAmount = autoDiscount.value;
                            if (discountAmount > itemsTotal) discountAmount = itemsTotal;
                        } else if (activeDiscount) {
                            const minSpend = activeDiscount.minSpend || 0;
                            if (itemsTotal >= minSpend) {
                                if (activeDiscount.type === 'percent') discountAmount = itemsTotal * (activeDiscount.value / 100);
                                else discountAmount = activeDiscount.value;
                                if (discountAmount > itemsTotal) discountAmount = itemsTotal;
                            }
                        }
                    }

                    if ((itemsTotal - discountAmount) > 100) {
                        shippingTotal = 0;
                    }

                    if (isWholesale && itemsTotal < 75) { alert("Minimum wholesale spend of £75 not met."); return; }

                    if (shippingTotal > 0) {
                        const pnpLabel = isWholesale ? `Wholesale Postage & Packaging` : `Postage & Packaging (${dest === 'uk' ? 'UK' : 'International'})`;
                        paypalItems.push({ name: pnpLabel, unit_amount: { currency_code: 'GBP', value: shippingTotal.toFixed(2) }, quantity: "1" });
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
                            let subtotal = 0;
                            cart.forEach(item => {
                                const displayPrice = isWholesale ? Math.round(item.price * 0.60 * 100) / 100 : item.price;
                                const itemTotal = displayPrice * (item.quantity || 1);
                                subtotal += itemTotal;
                                const sizeStr = item.size ? ` (Size: ${item.size})` : '';
                                orderBreakdown += `${item.quantity || 1}x ${item.title}${sizeStr} - £${itemTotal.toFixed(2)}\n`;
                            });
                            
                            if (!isWholesale) {
                                let discountAmount = 0;
                                let appliedDiscountName = "";
                                
                                if (autoDiscount && subtotal >= autoDiscount.minSpend) {
                                    if (autoDiscount.type === 'percent') discountAmount = subtotal * (autoDiscount.value / 100);
                                    else discountAmount = autoDiscount.value;
                                    if (discountAmount > subtotal) discountAmount = subtotal;
                                    appliedDiscountName = "Launch Offer";
                                } else if (activeDiscount) {
                                    const minSpend = activeDiscount.minSpend || 0;
                                    if (subtotal >= minSpend) {
                                        if (activeDiscount.type === 'percent') discountAmount = subtotal * (activeDiscount.value / 100);
                                        else discountAmount = activeDiscount.value;
                                        if (discountAmount > subtotal) discountAmount = subtotal;
                                        appliedDiscountName = activeDiscount.code;
                                    }
                                }
                                
                                if (discountAmount > 0) orderBreakdown += `\nDiscount Applied (${appliedDiscountName}): -£${discountAmount.toFixed(2)}\n`;
                            }

                            const templateParams = {
                                to_name: details.payer.name.given_name,
                                to_email: details.payer.email_address,
                                order_details: orderBreakdown,
                                shipping_cost: document.getElementById('cart-shipping-cost') ? document.getElementById('cart-shipping-cost').textContent : '£0.00',
                                total_paid: document.getElementById('cart-total') ? document.getElementById('cart-total').textContent.replace('Total: £', '') : '£0.00'
                            };

                            if (typeof emailjs !== 'undefined') emailjs.send('service_zmm27cb', 'template_ld7uqbh', templateParams).catch(err => console.error('Email failed...', err));

                            // ========================================================
                            // EXTRACT ADDRESS & SEND TO GOOGLE SHEETS
                            // ========================================================
                            let shippingAddress = "No address provided";
                            let flatAddress = "No address provided";
                            let addr = {};
                            let shipName = details.payer.name.given_name + ' ' + (details.payer.name.surname || '');

                            if (details.purchase_units && details.purchase_units[0].shipping && details.purchase_units[0].shipping.address) {
                                addr = details.purchase_units[0].shipping.address;
                                shipName = details.purchase_units[0].shipping.name ? details.purchase_units[0].shipping.name.full_name : shipName;
                                
                                flatAddress = [
                                    shipName, 
                                    addr.address_line_1, 
                                    addr.address_line_2, 
                                    addr.admin_area_2, 
                                    addr.admin_area_1, 
                                    addr.postal_code, 
                                    addr.country_code
                                ].filter(Boolean).join(', ');
                            }

                            const sheetData = {
                                name: shipName,
                                email: details.payer.email_address,
                                address_string: flatAddress,
                                addr_line_1: addr.address_line_1 || "N/A",
                                addr_line_2: addr.address_line_2 || "",
                                city: addr.admin_area_2 || "",
                                county: addr.admin_area_1 || "",
                                postcode: addr.postal_code || "",
                                country_code: addr.country_code || "GBR",
                                order_details: orderBreakdown.trim(),
                                subtotal: '£' + subtotal.toFixed(2),
                                shipping_cost: templateParams.shipping_cost,
                                discount: templateParams.order_details.includes('Discount Applied') ? 'Yes' : '£0.00',
                                total_paid: templateParams.total_paid,
                                order_id: details.id
                            };

                            // PASTE YOUR NEW GOOGLE SCRIPT WEB APP URL HERE:
                            const scriptURL = 'https://script.google.com/macros/s/AKfycbwaaQwZh7OD_ZL6kuEeehNUBjxVwfAdQfNrPd8yMajBVRUQKfJxi-H97TWeODqQ-yfN/exec';
                            
                            fetch(scriptURL, {
                                method: 'POST',
                                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                                body: JSON.stringify(sheetData)
                            }).then(response => {
                                if(!response.ok) throw new Error("HTTP error " + response.status);
                                return response.text();
                            }).then(data => {
                                console.log('Order saved to Google Sheets/Royal Mail:', data);
                            }).catch(error => console.error('Error saving order payload:', error));
                            // ========================================================

                        } catch (err) { console.error('EmailJS Error:', err); }

                        alert('Payment successful! We have received your order, ' + details.payer.name.given_name + ', and an email confirmation will be sent to you shortly.');
                        cart = []; activeDiscount = null; sessionStorage.removeItem('folkloreDiscount');
                        localStorage.setItem(cartKey, JSON.stringify(cart)); 
                        window.updateCartUI(); window.closeCart();
                    });
                }
            }).render('#paypal-button-container');
        }
    } catch (error) { console.warn("PayPal SDK could not initialize.", error); }
})();
