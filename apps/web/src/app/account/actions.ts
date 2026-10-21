"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cancelSubscription, DataError, deleteAccount, signOut, updateProfile } from "@/lib/data";
import { SESSION_COOKIE, viewer } from "@/lib/session";

export type State = { ok?: string; error?: string } | null;

export async function saveProfile(_: State, form: FormData): Promise<State> {
  try {
    updateProfile(await viewer(), { name: String(form.get("name") ?? ""), timezone: String(form.get("timezone") ?? "UTC") });
  } catch (e) {
    return { error: e instanceof DataError ? e.message : "Couldn't save" };
  }
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function toggleCancel(form: FormData) {
  cancelSubscription(await viewer(), form.get("resume") === "1");
  revalidatePath("/account");
}

export async function signOutAction() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) signOut(t);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}

export async function deleteAction(_: State, form: FormData): Promise<State> {
  const v = await viewer();
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== v.user?.email) return { error: "Type your email exactly to confirm" };
  deleteAccount(v);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/?deleted=1");
}
