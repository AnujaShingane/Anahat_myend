let checkoutScriptPromise;

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;

  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout.'));
    document.body.appendChild(script);
  });
  return checkoutScriptPromise;
}

export async function openRazorpayCheckout({ order, method, description, prefill = {}, notes = {} }) {
  await loadCheckoutScript();

  return new Promise((resolve, reject) => {
    const methodNames = { upi: 'UPI', card: 'Credit or debit card', netbanking: 'Net banking', wallet: 'Wallet' };
    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amountPaise || Math.round(order.amount * 100),
      currency: order.currency || 'INR',
      name: 'Anahat Transformations',
      description,
      order_id: order.orderId,
      prefill,
      notes,
      theme: { color: '#0F8594' },
      config: {
        display: {
          blocks: {
            selectedMethod: {
              name: `Pay with ${methodNames[method] || methodNames.upi}`,
              instruments: [{ method }],
            },
          },
          sequence: ['selectedMethod'],
          preferences: { show_default_blocks: false },
        },
      },
      handler: resolve,
      modal: { ondismiss: () => reject(new Error('Payment was cancelled.')) },
    });
    checkout.on('payment.failed', (event) => reject(new Error(event.error?.description || 'Payment failed.')));
    checkout.open();
  });
}
