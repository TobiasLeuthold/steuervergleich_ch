import TaxApp from "@/components/TaxApp";

export default function Page() {
  return (
    <main>
      <h1>Steuervergleich Schweiz</h1>
      <p className="lead">
        Wie viel Einkommenssteuer zahlen Sie in welcher Gemeinde? Geben Sie Ihren Bruttolohn ein:
        Die Karte zeigt die jährliche Steuer (Bund, Kanton, Gemeinde und optional Kirche) in allen
        Schweizer Gemeinden.
      </p>
      <TaxApp />
    </main>
  );
}
