"use client";

import Link from "next/link";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  CrmNotification,
  NotificationSummary,
} from "@/lib/repositories/notification.repository";

type NotificationBellProps = {
  summary: NotificationSummary;
};

function formatTime(value: string | null) {
  if (!value) {
    return "Без времени";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Без времени";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

function NotificationItem({
  notification,
}: {
  notification: CrmNotification;
}) {
  return (
    <Link
      href={notification.href}
      className="notificationItem"
    >
      <span
        className={`notificationMarker notificationMarker-${notification.kind}`}
        aria-hidden="true"
      />

      <span className="notificationItemContent">
        <strong>{notification.title}</strong>

        <small>
          {notification.companyName}
          {" · "}
          {notification.code}
        </small>
      </span>

      <time>
        {formatTime(notification.eventAt)}
      </time>
    </Link>
  );
}

function NotificationSection({
  title,
  notifications,
}: {
  title: string;
  notifications: CrmNotification[];
}) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <section className="notificationSection">
      <h3>{title}</h3>

      <div className="notificationItems">
        {notifications.map((notification) => (
          <NotificationItem
            key={`${notification.kind}-${notification.id}`}
            notification={notification}
          />
        ))}
      </div>
    </section>
  );
}

export function NotificationBell({
  summary,
}: NotificationBellProps) {
  const [isOpen, setIsOpen] =
    useState(false);

  const containerRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(
      event: MouseEvent,
    ) {
      const container =
        containerRef.current;

      if (
        container &&
        !container.contains(
          event.target as Node,
        )
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handlePointerDown,
    );

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown,
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, []);

  return (
    <div
      className="notificationControl"
      ref={containerRef}
    >
      <button
        type="button"
        className="notificationBell"
        aria-label="Уведомления"
        aria-expanded={isOpen}
        onClick={() =>
          setIsOpen((current) => !current)
        }
      >
        <span aria-hidden="true">🔔</span>

        {summary.total > 0 && (
          <span className="notificationBadge">
            {summary.total > 99
              ? "99+"
              : summary.total}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notificationDropdown">
          <header className="notificationHeader">
            <div>
              <strong>Уведомления</strong>
              <small>
                Задачи и активности на сегодня
              </small>
            </div>

            <span>{summary.total}</span>
          </header>

          {summary.total === 0 ? (
            <div className="notificationEmpty">
              На сегодня уведомлений нет.
            </div>
          ) : (
            <div className="notificationBody">
              <NotificationSection
                title="Просроченные задачи"
                notifications={
                  summary.overdueTasks
                }
              />

              <NotificationSection
                title="Задачи на сегодня"
                notifications={
                  summary.todayTasks
                }
              />

              <NotificationSection
                title="Активности на сегодня"
                notifications={
                  summary.todayActivities
                }
              />
            </div>
          )}

          <footer className="notificationFooter">
            <Link
              href="/tasks"
              onClick={() => setIsOpen(false)}
            >
              Все задачи
            </Link>

            <Link
              href="/activities"
              onClick={() => setIsOpen(false)}
            >
              Все активности
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}
