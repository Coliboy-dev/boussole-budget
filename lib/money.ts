export function toCents(amount: number): number {
  const absolute = Math.abs(amount);
  const cents = Math.round((absolute + Number.EPSILON * absolute) * 100);
  return cents === 0 ? 0 : Math.sign(amount) * cents;
}

export function fromCents(cents: number): number {
  return cents / 100;
}
