"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  deleteActivityAction,
  updateActivityAction,
} from "@/app/activities/actions";

import {
  activityPriorities,
  activityStatuses,
  activityTypes,
  type Activity,
  type ActivityCompanyOption,
  type ActivityContactOption,
  type ActivityDealOption,
} from "@/types/activity";

import styles from "./ActivityEditModal.module.css";

type ActivityEditModalProps = {
  activity: Activity;
  companies: ActivityCompanyOption[];
  contacts: ActivityContactOption[];
  deals: ActivityDealOption[];
  canDelete: boolean;
};

const typeNames: Record<string, string> = {
  Call: "Звонок",
  Email: "Email",
  Meeting: "Встреча",
  Message: "Сообщение",
  Note: "Заметка",
  Task: "Задача",
};

const statusNames: Record<string, string> = {
  Planned: "Запланирована",
  Completed: "Выполнена",
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

export function ActivityEditModal({
  activity,
  companies,
  contacts,
  deals,
  canDelete,
}: ActivityEditModalProps) {
  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const [companyId, setCompanyId] =
    useState(activity.company_id);

  const visibleContacts = contacts.filter(
    (contact) =>
      contact.company_id === companyId,
  );

  const visibleDeals = deals.filter(
    (deal) =>
      deal.company_id === companyId,
  );

  function openModal() {
    setCompanyId(activity.company_id);
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

    function handleClick(event: MouseEvent) {
      if (event.target === dialog) {
        dialogRef.current?.close();
      }
    }

    dialog.addEventListener(
      "click",
      handleClick,
    );

    return () => {
      dialog.removeEventListener(
        "click",
        handleClick,
      );
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className={styles.editButton}
        onClick={openModal}
        title="Редактировать активность"
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
              {activity.activity_code}
            </p>

            <h2>Редактирование активности</h2>
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
          action={updateActivityAction.bind(
            null,
            activity.id,
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
                  {company.display_name} ·{" "}
                  {company.company_code}
                </option>
              ))}
            </select>
          </label>

          <label>
            Тип *
            <select
              name="activity_type"
              required
              defaultValue={
                activity.activity_type
              }
            >
              {activityTypes.map((type) => (
                <option key={type} value={type}>
                  {typeNames[type] ?? type}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.fullWidth}>
            Тема *
            <input
              name="subject"
              required
              defaultValue={activity.subject}
            />
          </label>

          <label>
            Приоритет *
            <select
              name="priority"
              required
              defaultValue={activity.priority}
            >
              {activityPriorities.map(
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
            Статус *
            <select
              name="status"
              required
              defaultValue={activity.status}
            >
              {activityStatuses.map((status) => (
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
            Контакт
            <select
              name="contact_id"
              defaultValue={
                activity.contact_id ?? ""
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
                  {contact.full_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Сделка
            <select
              name="deal_id"
              defaultValue={
                activity.deal_id ?? ""
              }
            >
              <option value="">
                Сделка не выбрана
              </option>

              {visibleDeals.map((deal) => (
                <option
                  key={deal.id}
                  value={deal.id}
                >
                  {deal.deal_code} ·{" "}
                  {deal.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            Дата и время
            <input
              type="datetime-local"
              name="scheduled_at"
              defaultValue={toDateTimeLocal(
                activity.scheduled_at,
              )}
            />
          </label>

          <label>
            Ответственный
            <input
              name="owner_name"
              defaultValue={
                activity.owner_name ?? ""
              }
            />
          </label>

          <label className={styles.fullWidth}>
            Описание
            <textarea
              name="description"
              rows={4}
              defaultValue={
                activity.description ?? ""
              }
            />
          </label>

          <label className={styles.fullWidth}>
            Результат
            <textarea
              name="outcome"
              rows={3}
              defaultValue={
                activity.outcome ?? ""
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
            action={deleteActivityAction.bind(
              null,
              activity.id,
            )}
            className={styles.deleteForm}
            onSubmit={(event) => {
              const confirmed = window.confirm(
                `Удалить активность «${activity.subject}»? ` +
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
              Удалить активность
            </button>
          </form>
        )}
      </dialog>
    </>
  );
}
