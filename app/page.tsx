import TaxApp from "@/components/TaxApp";

export default function Page() {
  return (
    <main>
      <h1>Steuervergleich Schweiz</h1>
      <p className="lead">
        Wie viel Steuern zahlen Sie in welcher Gemeinde? Als Privatperson die Einkommenssteuer auf
        Ihren Bruttolohn, als Unternehmen (AG/GmbH) die Gewinn- und Kapitalsteuer: Die Karte zeigt
        die jährliche Steuer von Bund, Kanton und Gemeinde in allen Schweizer Gemeinden.
      </p>
      <TaxApp />
    </main>
  );
}
