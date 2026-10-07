// Mock payment gateway. Replace the two functions with Razorpay/Stripe calls later.
import { v4 as uuid } from 'uuid';

export async function createOrder(amount) {
  return { orderId: `order_${uuid()}`, amount };
}

export async function verifyPayment(_orderId, _paymentRef) {
  return true;
}
