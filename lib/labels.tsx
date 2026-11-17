"use client";

import { createContext, useContext } from "react";
import type { Mode } from "./data";

// Wording that depends on whether private income tax or company profit tax is
// shown, so the map, ranking and charts can stay mode-agnostic.

export type Labels = {
  /** "Bruttolohn" / "Gewinn" */
  amount: string;
  /** share column / tooltip row: "vom Bruttolohn" */
  share: string;
  /** chart x axis */
  axis: string;
  /** vertical marker in the charts */
  marker: string;
  /** what the map / ranking shows */
  taxName: string;
};

export const LABELS: Record<Mode, Labels> = {
  private: {
    amount: "Bruttolohn",
    share: "vom Bruttolohn",
    axis: "Bruttolohn pro Jahr (CHF)",
    marker: "Ihr Lohn",
    taxName: "Einkommenssteuer",
  },
  corp: {
    amount: "Gewinn vor Steuern",
    share: "vom Gewinn",
    axis: "Gewinn vor Steuern pro Jahr (CHF)",
    marker: "Ihr Gewinn",
    taxName: "Gewinn- und Kapitalsteuer",
  },
};

export const LabelsContext = createContext<Labels>(LABELS.private);
export const useLabels = () => useContext(LabelsContext);
