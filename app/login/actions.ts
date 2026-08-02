"use server";

import { redirect } from "next/navigation";

import {
  authenticateUser,
  createSession,
  recordLogin,
} from "@/modules/auth";

function safeNextPath(
  value: FormDataEntryValue | null,
): string {
  const path =
    String(value ?? "/").trim();

  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/login")
  ) {
    return "/";
  }

  return path;
}

export async function loginAction(
  formData: FormData,
): Promise<void> {
  const email =
    String(
      formData.get("email") ?? "",
    )
      .trim()
      .toLowerCase();

  const password =
    String(
      formData.get("password") ?? "",
    );

  const nextPath =
    safeNextPath(
      formData.get("next"),
    );

  const user =
    await authenticateUser(
      email,
      password,
    );

  if (!user) {
    const params =
      new URLSearchParams({
        error: "credentials",
        email,
        next: nextPath,
      });

    redirect(
      `/login?${params.toString()}`,
    );
  }

  await createSession(
    user.id,
    user.tenantId,
  );

  await recordLogin(user.id);

  redirect(nextPath);
}
