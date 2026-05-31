export function ButtonOverflow({ fixed }: { fixed: boolean }) {
  return (
    <div className="card">
      <h2 className="card-title">Checkout</h2>
      <p className="card-sub">Review your order, then continue.</p>
      <ul className="summary">
        <li>
          <span>Pro plan — annual</span>
          <span>$190.00</span>
        </li>
        <li>
          <span>Seats × 3</span>
          <span>$57.00</span>
        </li>
        <li className="summary-total">
          <span>Total</span>
          <span>$247.00</span>
        </li>
      </ul>
      <button className={`cta ${fixed ? "cta-fixed" : ""}`}>
        Click to Continue to the Next Step
      </button>
    </div>
  );
}
