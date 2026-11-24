import type React from "react";
import {
  Activity,
  Award,
  Baby,
  Brain,
  Clock,
  Cpu,
  Eye,
  FlaskConical,
  HeartPulse,
  Microscope,
  Pill,
  ScanLine,
  ShieldCheck,
  SmilePlus,
  Sparkles,
  Stethoscope,
} from "lucide-react";

export const SERVICE_ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Stethoscope,
  SmilePlus,
  HeartPulse,
  FlaskConical,
  Microscope,
  ScanHeart: Activity,
  Activity,
  ScanLine,
  Brain,
  Eye,
  Baby,
  Pill,
  Sparkles,
  Cpu,
  Award,
  Clock,
  ShieldCheck,
};

export const SERVICE_ICON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Stethoscope", label: "Stethoscope — Terapiya / Umumiy" },
  { value: "SmilePlus", label: "SmilePlus — Stomatologiya" },
  { value: "HeartPulse", label: "HeartPulse — Kardiologiya" },
  { value: "FlaskConical", label: "FlaskConical — Laboratoriya" },
  { value: "ScanHeart", label: "ScanHeart — UZI / Diagnostika" },
  { value: "Microscope", label: "Microscope — Mikroskopik tahlil" },
  { value: "Activity", label: "Activity — Funksional diagnostika" },
  { value: "ScanLine", label: "ScanLine — Rentgen / MRT / MSKT" },
  { value: "Brain", label: "Brain — Nevrologiya" },
  { value: "Eye", label: "Eye — Oftalmologiya" },
  { value: "Baby", label: "Baby — Pediatriya" },
  { value: "Pill", label: "Pill — Farmakologiya / Muolaja" },
  { value: "Sparkles", label: "Sparkles — Estetik tibbiyot" },
];
