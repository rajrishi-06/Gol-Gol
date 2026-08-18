import { Banknote, CreditCard, Smartphone, Wallet } from "lucide-react";

/**
 * Payment methods. Cash and UPI settle directly between rider and driver today;
 * card and wallet are modelled end-to-end (the `payments` row carries method,
 * status and a `reference` for a gateway id) but stay disabled until a payment
 * provider is connected.
 */
export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: Banknote, hint: "Pay the driver directly" },
  { id: "upi", label: "UPI", icon: Smartphone, hint: "Pay on arrival via UPI" },
  { id: "card", label: "Card", icon: CreditCard, hint: "Saved card", disabled: true },
  { id: "wallet", label: "Wallet", icon: Wallet, hint: "Gol·Gol balance", disabled: true },
];

export function paymentLabel(id) {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label ?? "Cash";
}
