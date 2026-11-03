import type { GemPackCheckoutOrder } from './shop';

export type RazorpayCheckoutPayment = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayFailure = {
  error?: { description?: string; reason?: string };
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  theme: { color: string };
  handler: (payment: RazorpayCheckoutPayment) => void;
  modal: { ondismiss: () => void };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: 'payment.failed', callback: (failure: RazorpayFailure) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let checkoutScript: Promise<void> | null = null;

/** Load Razorpay's hosted checkout once; all secret credentials stay on the backend. */
async function ensureRazorpayCheckout(): Promise<void> {
  if (typeof window === 'undefined') throw new Error('Checkout is only available in a browser.');
  if (window.Razorpay) return;

  checkoutScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => window.Razorpay ? resolve() : reject(new Error('Payment checkout did not load.'));
    script.onerror = () => reject(new Error('Could not load the payment checkout.'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    checkoutScript = null;
    throw error;
  });

  await checkoutScript;
}

/** Opens hosted checkout and resolves only with Razorpay's signed success response. */
export async function openRazorpayCheckout(order: GemPackCheckoutOrder): Promise<RazorpayCheckoutPayment> {
  await ensureRazorpayCheckout();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Payment checkout is unavailable. Please try again.');

  return new Promise<RazorpayCheckoutPayment>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const checkout = new Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Superkritical',
      description: `Gem pack · ${order.gems_amount.toLocaleString('en-IN')} Gems`,
      order_id: order.order_id,
      theme: { color: '#32df85' },
      handler: (payment) => finish(() => resolve(payment)),
      modal: {
        ondismiss: () => finish(() => reject(new Error('Checkout was closed. No Gems were added.'))),
      },
    });

    checkout.on('payment.failed', (failure) => {
      const message = failure.error?.description || failure.error?.reason || 'Payment did not complete.';
      finish(() => reject(new Error(message)));
    });
    checkout.open();
  });
}
