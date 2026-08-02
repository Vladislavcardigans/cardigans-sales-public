"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  deleteTaskAction,
  updateTaskAction,
} from "@/app/tasks/actions";

import {
  taskPriorities,
  taskStatuses,
  type SalesTask,
  type TaskOption,
} from "@/types/task";

import styles from "./TaskEditModal.module.css";

type CompanyOption = {
  id: string;
  display_name: string;
  company_code: string;
};

type TaskEditModalProps = {
  task: SalesTask;
  companies: CompanyOption[];
  contacts: TaskOption[];
  deals: TaskOption[];
  activities: TaskOption[];
  canDelete: boolean;
};

const statusNames: Record<string, string> = {
  Todo: "К выполнению",
  InProgress: "В работе",
  Done: "Выполнена",
  Cancelled: "Отменена",
};

const priorityNames: Record<string, string> = {
  Low: "Низкий",
  Normal: "Обычный",
  High: "Высокий",
  Urgent: "Срочный",
};

function toDateTimeLocal(
  value: string | null,
): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Date(
    date.getTime() -
      date.getTimezoneOffset() * 60_000,
  )
    .toISOString()
    .slice(0, 16);
}

export function TaskEditModal({
  task,
  companies,
  contacts,
  deals,
  activities,
  canDelete,
}: TaskEditModalProps) {
  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const [companyId, setCompanyId] =
    useState(task.company_id);

  const visibleContacts = contacts.filter(
    (item) =>
      item.company_id === companyId,
  );

  const visibleDeals = deals.filter(
    (item) =>
      item.company_id === companyId,
  );

  const visibleActivities = activities.filter(
    (item) =>
      item.company_id === companyId,
  );

  function openModal() {
    setCompanyId(task.company_id);
    dialogRef.current?.showModal();
  }

  function closeModal() {
    dialogRef.current?.close();
  }

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    function handleBackdropClick(
      event: MouseEvent,
    ) {
      if (event.target === dialog) {
        dialogRef.current?.close();
      }
    }

    dialog.addEventListener(
      "click",
      handleBackdropClick,
    );

    return () => {
      dialog.removeEventListener(
        "click",
        handleBackdropClick,
      );
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className={styles.editButton}
        onClick={openModal}
      >
        <span aria-hidden="true">✏</span>
        Изменить
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        onCancel={closeModal}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>
              {task.task_code}
            </p>

            <h2>Редактирование задачи</h2>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={closeModal}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form
          action={updateTaskAction.bind(
            null,
            task.id,
          )}
          className={styles.form}
        >
          <label>
            Компания *
            <select
              name="company_id"
              required
              value={companyId}
              onChange={(event) =>
                setCompanyId(event.target.value)
              }
            >
              {companies.map((company) => (
                <option
                  key={company.id}
                  value={company.id}
                >
                  {company.display_name}
                  {" · "}
                  {company.company_code}
                </option>
              ))}
            </select>
          </label>

          <label>
            Ответственный
            <input
              name="owner_name"
              defaultValue={
                task.owner_name ?? ""
              }
            />
          </label>

          <label className={styles.fullWidth}>
            Название *
            <input
              name="title"
              required
              maxLength={255}
              defaultValue={task.title}
            />
          </label>

          <label>
            Статус *
            <select
              name="status"
              required
              defaultValue={task.status}
            >
              {taskStatuses.map((status) => (
                <option
                  key={status}
                  value={status}
                >
                  {statusNames[status] ?? status}
                </option>
              ))}
            </select>
          </label>

          <label>
            Приоритет *
            <select
              name="priority"
              required
              defaultValue={task.priority}
            >
              {taskPriorities.map(
                (priority) => (
                  <option
                    key={priority}
                    value={priority}
                  >
                    {priorityNames[priority] ??
                      priority}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Контакт
            <select
              name="contact_id"
              defaultValue={
                task.contact_id ?? ""
              }
            >
              <option value="">
                Контакт не выбран
              </option>

              {visibleContacts.map((contact) => (
                <option
                  key={contact.id}
                  value={contact.id}
                >
                  {contact.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Сделка
            <select
              name="deal_id"
              defaultValue={task.deal_id ?? ""}
            >
              <option value="">
                Сделка не выбрана
              </option>

              {visibleDeals.map((deal) => (
                <option
                  key={deal.id}
                  value={deal.id}
                >
                  {deal.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Активность
            <select
              name="activity_id"
              defaultValue={
                task.activity_id ?? ""
              }
            >
              <option value="">
                Активность не выбрана
              </option>

              {visibleActivities.map(
                (activity) => (
                  <option
                    key={activity.id}
                    value={activity.id}
                  >
                    {activity.label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Срок
            <input
              name="due_at"
              type="datetime-local"
              defaultValue={toDateTimeLocal(
                task.due_at,
              )}
            />
          </label>

          <label className={styles.fullWidth}>
            Описание
            <textarea
              name="description"
              rows={5}
              maxLength={3000}
              defaultValue={
                task.description ?? ""
              }
            />
          </label>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={closeModal}
            >
              Отмена
            </button>

            <button
              type="submit"
              className={styles.saveButton}
            >
              Сохранить
            </button>
          </div>
        </form>

        {canDelete && (
          <form
            action={deleteTaskAction.bind(
              null,
              task.id,
            )}
            className={styles.deleteForm}
            onSubmit={(event) => {
              const confirmed = window.confirm(
                `Удалить задачу «${task.title}»? ` +
                  "Она будет перемещена в корзину.",
              );

              if (!confirmed) {
                event.preventDefault();
              }
            }}
          >
            <button
              type="submit"
              className={styles.deleteButton}
            >
              Удалить задачу
            </button>
          </form>
        )}
      </dialog>
    </>
  );
}
