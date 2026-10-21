"use server";
import { redirect } from "next/navigation";
import { demoCheckout, type PlanCode } from "@/lib/data";
import { viewer } from "@/lib/session";

export async function confirmCheckout(form: FormData) {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/pricing");
  demoCheckout(v, String(form.get("plan")) as PlanCode, form.get("interval") === "month" ? "month" : "year");
  redirect("/account?welcome=1");
}
