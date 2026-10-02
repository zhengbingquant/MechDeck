import { useMech } from './useMech';

/** Published specifications of the mech on stage. */
export function SpecsCard() {
  const mech = useMech();
  return (
    <section className="card specs" aria-labelledby="specs-h">
      <div className="card-head">
        <h2 id="specs-h">Specifications</h2>
        <span className="badge">{mech.designation}</span>
      </div>
      <dl>
        {mech.specs.map((s) => (
          <div key={s.label}>
            <dt className="muted">{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
