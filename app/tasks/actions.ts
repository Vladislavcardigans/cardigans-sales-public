"use server";
import { requirePermission } from "@/modules/auth";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";

import {
  createTask,
  deleteTask,
  updateTask,
  isTaskPriority,
  isTaskStatus,
} from "@/lib/repositories/task.repository";

function requiredText(
  formData: FormData,
  field: string,
  label: string,
): string {
  const value =
    String(formData.get(field) ?? "").trim();

  if (!value) {
    throw new Error(
      `${label} — обязательное поле.`,
    );
  }

  return value;
}

function optionalText(
  formData: FormData,
  field: string,
): string | null {
  const value =
    String(formData.get(field) ?? "").trim();

  return value || null;
}

export async function createTaskAction(
  formData: FormData,
): Promise<void> {
  await requirePermission("task.create");

  const companyId = requiredText(
    formData,
    "company_id",
    "Компания",
  );

  const title = requiredText(
    formData,
    "title",
    "Название задачи",
  );

  const statusValue =
    String(
      formData.get("status") ?? "Todo",
    ).trim();

  const priorityValue =
    String(
      formData.get("priority") ?? "Normal",
    ).trim();

  await createTask({
    companyId,

    contactId:
      optionalText(formData, "contact_id"),

    dealId:
      optionalText(formData, "deal_id"),

    activityId:
      optionalText(formData, "activity_id"),

    title,

    description:
      optionalText(formData, "description"),

    status:
      isTaskStatus(statusValue)
        ? statusValue
        : "Todo",

    priority:
      isTaskPriority(priorityValue)
        ? priorityValue
        : "Normal",

    dueAt:
      optionalText(formData, "due_at"),

    ownerName:
      optionalText(formData, "owner_name"),
  });

  revalidatePath("/tasks");
  revalidatePath(
    `/companies/${companyId}`,
  );
}

export async function updateTaskAction(
  taskId: string,
  formData: FormData,
): Promise<void> {
  await requirePermission("task.update");

  const normalizedTaskId = taskId.trim();

  if (!normalizedTaskId) {
    throw new Error(
      "Не указан идентификатор задачи.",
    );
  }

  const companyId = requiredText(
    formData,
    "company_id",
    "Компания",
  );

  const title = requiredText(
    formData,
    "title",
    "Название задачи",
  );

  const statusValue = requiredText(
    formData,
    "status",
    "Статус",
  );

  if (!isTaskStatus(statusValue)) {
    throw new Error(
      "Указан неизвестный статус задачи.",
    );
  }

  const priorityValue = requiredText(
    formData,
    "priority",
    "Приоритет",
  );

  if (!isTaskPriority(priorityValue)) {
    throw new Error(
      "Указан неизвестный приоритет.",
    );
  }

  const task = await updateTask(
    normalizedTaskId,
    {
      companyId,

      contactId:
        optionalText(formData, "contact_id"),

      dealId:
        optionalText(formData, "deal_id"),

      activityId:
        optionalText(formData, "activity_id"),

      title,

      description:
        optionalText(formData, "description"),

      status: statusValue,
      priority: priorityValue,

      dueAt:
        optionalText(formData, "due_at"),

      ownerName:
        optionalText(formData, "owner_name"),
    },
  );

  revalidatePath("/tasks");
  revalidatePath("/");
  revalidatePath(
    `/companies/${task.company_id}`,
  );

  redirect("/tasks");
}

export async function completeTaskAction(
  taskId: string,
): Promise<void> {
  await requirePermission("task.complete");

  const normalizedTaskId = taskId.trim();

  if (!normalizedTaskId) {
    throw new Error(
      "Не указан идентификатор задачи.",
    );
  }

  const result = await getDb().query<{
    id: string;
    company_id: string;
  }>(
    `
      UPDATE sales.tasks

      SET
        status = 'Done',
        completed_at = COALESCE(
          completed_at,
          NOW()
        ),
        updated_at = NOW()

      WHERE id = $1
        AND deleted_at IS NULL
        AND status NOT IN (
          'Done',
          'Cancelled'
        )

      RETURNING
        id,
        company_id
    `,
    [normalizedTaskId],
  );

  const task = result.rows[0];

  revalidatePath("/tasks");
  revalidatePath("/");

  if (task?.company_id) {
    revalidatePath(
      `/companies/${task.company_id}`,
    );
  }
}

export async function deleteTaskAction(
  taskId: string,
): Promise<void> {
  await requirePermission("task.delete");

  const deletedTask =
    await deleteTask(taskId);

  revalidatePath("/tasks");
  revalidatePath("/");
  revalidatePath(
    `/companies/${deletedTask.company_id}`,
  );

  redirect("/tasks");
}
