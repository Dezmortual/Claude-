"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DataError, deleteAccount, signOutEverywhere, updateProfile } from "@/lib/data";
import { endSession } from "@/lib/server/auth";
import { SESSION_COOKIE, viewer } from "@/lib/session";

export type State = { ok?: string; error?: string } | null;

export async function saveProfile(_: State, form: FormData): Promise<State> {
  try {
    await updateProfile(await viewer(), { name: String(form.get("name") ?? "").slice(0, 200), timezone: String(form.get("timezone") ?? "UTC").slice(0, 60) });
  } catch (e) {
    return { error: e instanceof DataError ? e.message : "Couldn't save" };
  }
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function signOutAction() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) await endSession(t);
  jar.delete(SESSION_COOKIE);
  redirect("/sign-in");
}

export async function signOutEverywhereAction() {
  await signOutEverywhere(await viewer());
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in?signedout=all");
}

export async function deleteAction(_: State, form: FormData): Promise<State> {
  const v = await viewer();
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== v.user?.email) return { error: "Type your email exactly to confirm" };
  await deleteAccount(v);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in?deleted=1");
}
