"use server";

import { redirect } from "next/navigation";

import {
  deleteCurrentSession,
} from "@/modules/auth";

export async function logoutAction():
Promise<void> {
  await deleteCurrentSession();
  redirect("/login");
}
