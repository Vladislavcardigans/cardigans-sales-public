#!/usr/bin/env bash

PROJECT_DIR="/opt/cardigans-sales"
INFRA_ENV="/opt/cardigans/.env"
POSTGRES_CONTAINER="cardigans-postgres"
APP_CONTAINER="cardigans-sales"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$PROJECT_DIR/.backups/install-contacts-$STAMP"

trap '
  code=$?
  echo
  echo "❌ Ошибка на строке $LINENO, код $code."
  echo "Терминал останется открытым."
  exit $code
' ERR

cd "$PROJECT_DIR" || exit 1

echo "=================================================="
echo " Установка модуля Contacts"
echo "=================================================="
echo
echo "Будет создано:"
echo "  • таблица sales.contacts;"
echo "  • связь Contact → Company;"
echo "  • маршрут /contacts;"
echo "  • форма создания контакта;"
echo "  • repository и Server Action;"
echo "  • API health-check контактов;"
echo "  • проверка сборки и базы."
echo

read -r -p "Продолжить? [y/N]: " CONFIRM

case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *)
    echo "Отменено."
    exit 0
    ;;
esac

echo
echo "==> 1/9 Резервное копирование"

mkdir -p "$BACKUP_DIR"

for path in \
  app/contacts \
  app/companies/page.tsx \
  app/globals.css \
  lib/repositories/contact.repository.ts \
  types/contact.ts
do
  if [[ -e "$path" ]]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$path")"
    cp -a "$path" "$BACKUP_DIR/$path"
  fi
done

echo "Резервная копия: $BACKUP_DIR"

echo
echo "==> 2/9 Загрузка параметров PostgreSQL"

if [[ ! -f "$INFRA_ENV" ]]; then
  echo "❌ Не найден $INFRA_ENV"
  exit 1
fi

set -a
source "$INFRA_ENV"
set +a

: "${POSTGRES_USER:?Не указан POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?Не указан POSTGRES_PASSWORD}"
: "${POSTGRES_DB:?Не указан POSTGRES_DB}"

echo "База: $POSTGRES_DB"

echo
echo "==> 3/9 Создание таблицы contacts"

docker exec -i \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  psql \
  -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" <<'SQL'
CREATE TABLE IF NOT EXISTS sales.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL
    REFERENCES sales.companies(id)
    ON DELETE CASCADE,

  first_name TEXT NOT NULL,
  last_name TEXT,
  job_title TEXT,

  email TEXT,
  phone TEXT,
  telegram TEXT,
  linkedin_url TEXT,

  preferred_channel TEXT NOT NULL DEFAULT 'Email',
  contact_status TEXT NOT NULL DEFAULT 'Active',

  is_decision_maker BOOLEAN NOT NULL DEFAULT FALSE,
  do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT contacts_first_name_not_blank
    CHECK (LENGTH(TRIM(first_name)) > 0),

  CONSTRAINT contacts_preferred_channel_valid
    CHECK (
      preferred_channel IN (
        'Email',
        'Phone',
        'Telegram',
        'LinkedIn',
        'Other'
      )
    ),

  CONSTRAINT contacts_status_valid
    CHECK (
      contact_status IN (
        'Active',
        'Inactive',
        'Left company',
        'Unknown'
      )
    )
);

ALTER TABLE sales.contacts OWNER TO sales_app;

CREATE INDEX IF NOT EXISTS contacts_company_id_idx
  ON sales.contacts(company_id);

CREATE INDEX IF NOT EXISTS contacts_email_idx
  ON sales.contacts(LOWER(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_name_idx
  ON sales.contacts(
    LOWER(first_name),
    LOWER(COALESCE(last_name, ''))
  );

CREATE UNIQUE INDEX IF NOT EXISTS contacts_company_email_uidx
  ON sales.contacts(company_id, LOWER(email))
  WHERE email IS NOT NULL;

GRANT ALL PRIVILEGES
  ON sales.contacts
  TO sales_app;
SQL

echo
echo "==> 4/9 Создание типов и repository"

mkdir -p \
  app/contacts \
  app/api/health/contacts \
  lib/repositories \
  types

cat > types/contact.ts <<'EOF'
export const preferredChannels = [
  "Email",
  "Phone",
  "Telegram",
  "LinkedIn",
  "Other",
] as const;

export type PreferredChannel =
  (typeof preferredChannels)[number];

export const contactStatuses = [
  "Active",
  "Inactive",
  "Left company",
  "Unknown",
] as const;

export type ContactStatus =
  (typeof contactStatuses)[number];

export type Contact = {
  id: string;
  company_id: string;
  company_name: string;
  company_code: string;

  first_name: string;
  last_name: string | null;
  job_title: string | null;

  email: string | null;
  phone: string | null;
  telegram: string | null;
  linkedin_url: string | null;

  preferred_channel: PreferredChannel;
  contact_status: ContactStatus;

  is_decision_maker: boolean;
  do_not_contact: boolean;

  notes: string | null;

  created_at: Date;
  updated_at: Date;
};

export type CreateContactInput = {
  companyId: string;

  firstName: string;
  lastName: string | null;
  jobTitle: string | null;

  email: string | null;
  phone: string | null;
  telegram: string | null;
  linkedinUrl: string | null;

  preferredChannel: PreferredChannel;
  contactStatus: ContactStatus;

  isDecisionMaker: boolean;
  doNotContact: boolean;

  notes: string | null;
};

export type CompanyOption = {
  id: string;
  company_code: string;
  display_name: string;
};
EOF

cat > lib/repositories/contact.repository.ts <<'EOF'
import { getDb } from "@/lib/db";

import type {
  CompanyOption,
  Contact,
  ContactStatus,
  CreateContactInput,
  PreferredChannel,
} from "@/types/contact";

export async function listContacts(
  limit = 100,
): Promise<Contact[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);

  const result = await getDb().query<Contact>(
    `
      SELECT
        contact.id,
        contact.company_id,
        company.display_name AS company_name,
        company.company_code,

        contact.first_name,
        contact.last_name,
        contact.job_title,

        contact.email,
        contact.phone,
        contact.telegram,
        contact.linkedin_url,

        contact.preferred_channel,
        contact.contact_status,

        contact.is_decision_maker,
        contact.do_not_contact,

        contact.notes,

        contact.created_at,
        contact.updated_at

      FROM sales.contacts AS contact

      INNER JOIN sales.companies AS company
        ON company.id = contact.company_id

      ORDER BY
        contact.created_at DESC

      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows;
}

export async function listCompanyOptions():
Promise<CompanyOption[]> {
  const result = await getDb().query<CompanyOption>(
    `
      SELECT
        id,
        company_code,
        display_name
      FROM sales.companies
      ORDER BY LOWER(display_name)
    `,
  );

  return result.rows;
}

export async function createContact(
  input: CreateContactInput,
): Promise<Contact> {
  const result = await getDb().query<Contact>(
    `
      WITH inserted AS (
        INSERT INTO sales.contacts (
          company_id,

          first_name,
          last_name,
          job_title,

          email,
          phone,
          telegram,
          linkedin_url,

          preferred_channel,
          contact_status,

          is_decision_maker,
          do_not_contact,

          notes
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10,
          $11, $12,
          $13
        )
        RETURNING *
      )

      SELECT
        inserted.id,
        inserted.company_id,
        company.display_name AS company_name,
        company.company_code,

        inserted.first_name,
        inserted.last_name,
        inserted.job_title,

        inserted.email,
        inserted.phone,
        inserted.telegram,
        inserted.linkedin_url,

        inserted.preferred_channel,
        inserted.contact_status,

        inserted.is_decision_maker,
        inserted.do_not_contact,

        inserted.notes,

        inserted.created_at,
        inserted.updated_at

      FROM inserted

      INNER JOIN sales.companies AS company
        ON company.id = inserted.company_id
    `,
    [
      input.companyId,

      input.firstName,
      input.lastName,
      input.jobTitle,

      input.email,
      input.phone,
      input.telegram,
      input.linkedinUrl,

      input.preferredChannel,
      input.contactStatus,

      input.isDecisionMaker,
      input.doNotContact,

      input.notes,
    ],
  );

  return result.rows[0];
}

export async function countContacts(): Promise<{
  total: number;
  decisionMakers: number;
  doNotContact: number;
}> {
  const result = await getDb().query<{
    total: string;
    decision_makers: string;
    do_not_contact: string;
  }>(
    `
      SELECT
        COUNT(*)::TEXT AS total,

        COUNT(*) FILTER (
          WHERE is_decision_maker = TRUE
        )::TEXT AS decision_makers,

        COUNT(*) FILTER (
          WHERE do_not_contact = TRUE
        )::TEXT AS do_not_contact

      FROM sales.contacts
    `,
  );

  return {
    total: Number(result.rows[0]?.total ?? 0),
    decisionMakers:
      Number(result.rows[0]?.decision_makers ?? 0),
    doNotContact:
      Number(result.rows[0]?.do_not_contact ?? 0),
  };
}

export function isPreferredChannel(
  value: string,
): value is PreferredChannel {
  return [
    "Email",
    "Phone",
    "Telegram",
    "LinkedIn",
    "Other",
  ].includes(value);
}

export function isContactStatus(
  value: string,
): value is ContactStatus {
  return [
    "Active",
    "Inactive",
    "Left company",
    "Unknown",
  ].includes(value);
}
EOF

echo
echo "==> 5/9 Создание Server Action"

cat > app/contacts/actions.ts <<'EOF'
"use server";

import { revalidatePath } from "next/cache";

import {
  createContact,
  isContactStatus,
  isPreferredChannel,
} from "@/lib/repositories/contact.repository";

function requiredText(
  formData: FormData,
  field: string,
  label: string,
): string {
  const value = String(formData.get(field) ?? "").trim();

  if (!value) {
    throw new Error(`${label} — обязательное поле.`);
  }

  return value;
}

function optionalText(
  formData: FormData,
  field: string,
): string | null {
  const value = String(formData.get(field) ?? "").trim();
  return value || null;
}

function checkboxValue(
  formData: FormData,
  field: string,
): boolean {
  return formData.get(field) === "on";
}

export async function createContactAction(
  formData: FormData,
): Promise<void> {
  const companyId = requiredText(
    formData,
    "company_id",
    "Компания",
  );

  const firstName = requiredText(
    formData,
    "first_name",
    "Имя",
  );

  const preferredChannelValue =
    String(
      formData.get("preferred_channel") ?? "Email",
    ).trim();

  const contactStatusValue =
    String(
      formData.get("contact_status") ?? "Active",
    ).trim();

  await createContact({
    companyId,

    firstName,
    lastName: optionalText(formData, "last_name"),
    jobTitle: optionalText(formData, "job_title"),

    email: optionalText(formData, "email"),
    phone: optionalText(formData, "phone"),
    telegram: optionalText(formData, "telegram"),
    linkedinUrl:
      optionalText(formData, "linkedin_url"),

    preferredChannel:
      isPreferredChannel(preferredChannelValue)
        ? preferredChannelValue
        : "Email",

    contactStatus:
      isContactStatus(contactStatusValue)
        ? contactStatusValue
        : "Active",

    isDecisionMaker:
      checkboxValue(formData, "is_decision_maker"),

    doNotContact:
      checkboxValue(formData, "do_not_contact"),

    notes: optionalText(formData, "notes"),
  });

  revalidatePath("/contacts");
}
EOF

echo
echo "==> 6/9 Создание страницы Contacts"

cat > app/contacts/page.tsx <<'EOF'
import Link from "next/link";

import { createContactAction } from "./actions";

import {
  countContacts,
  listCompanyOptions,
  listContacts,
} from "@/lib/repositories/contact.repository";

export const dynamic = "force-dynamic";

const navigation = [
  ["⌂", "Главная", "/"],
  ["▦", "Компании", "/companies"],
  ["◎", "Контакты", "/contacts"],
  ["◇", "Сделки", "#"],
  ["✓", "Задачи", "#"],
  ["▥", "Аналитика", "#"],
  ["⚙", "Настройки", "#"],
];

const channelNames: Record<string, string> = {
  Email: "Email",
  Phone: "Телефон",
  Telegram: "Telegram",
  LinkedIn: "LinkedIn",
  Other: "Другой",
};

const statusNames: Record<string, string> = {
  Active: "Активный",
  Inactive: "Неактивный",
  "Left company": "Ушёл из компании",
  Unknown: "Неизвестно",
};

export default async function ContactsPage() {
  const [contacts, companies, metrics] =
    await Promise.all([
      listContacts(100),
      listCompanyOptions(),
      countContacts(),
    ]);

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brandMark">CA</div>

          <div>
            <div className="brandName">
              Cardigans Arena
            </div>

            <div className="brandProduct">
              Sales OS
            </div>
          </div>
        </div>

        <nav className="navigation">
          {navigation.map(([icon, label, href]) => (
            <Link
              key={label}
              href={href}
              className={
                `navItem ${
                  label === "Контакты" ? "active" : ""
                }`
              }
            >
              <span className="navIcon">
                {icon}
              </span>

              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebarFooter">
          <div className="userAvatar">ВК</div>

          <div>
            <strong>Владислав</strong>
            <span>Администратор</span>
          </div>
        </div>
      </aside>

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Продажи</span>
            <strong>/</strong>
            <span>Контакты</span>
          </div>

          <div className="databaseStatus">
            <span className="databaseDot" />
            PostgreSQL подключён
          </div>
        </header>

        <section className="pageHeader">
          <div>
            <div className="eyebrow">
              Коммерческий блок
            </div>

            <h1>Контакты</h1>

            <p>
              Люди, участвующие в принятии решений
              внутри компаний.
            </p>
          </div>
        </section>

        <section className="metricsGrid">
          <article className="metricCard">
            <div className="metricLabel">
              Всего контактов
            </div>

            <strong>{metrics.total}</strong>

            <p>записей в CRM</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Лица, принимающие решения
            </div>

            <strong>
              {metrics.decisionMakers}
            </strong>

            <p>отмечены как ЛПР</p>
          </article>

          <article className="metricCard">
            <div className="metricLabel">
              Запрещено связываться
            </div>

            <strong>
              {metrics.doNotContact}
            </strong>

            <p>контактов с ограничением</p>
          </article>
        </section>

        <section className="workspaceGrid">
          <section className="contentPanel">
            <div className="panelTitle">
              <div>
                <h2>Каталог контактов</h2>
                <p>Последние 100 записей</p>
              </div>
            </div>

            {contacts.length === 0 ? (
              <div className="emptyState">
                <div className="emptyIcon">
                  ◎
                </div>

                <h3>
                  В базе пока нет контактов
                </h3>

                <p>
                  Создай первую компанию или выбери
                  существующую, затем добавь человека
                  через форму справа.
                </p>
              </div>
            ) : (
              <div className="tableViewport">
                <div className="contactTable">
                  <div className="contactTableRow contactTableHead">
                    <div>Контакт</div>
                    <div>Компания</div>
                    <div>Каналы связи</div>
                    <div>Предпочтение</div>
                    <div>Статус</div>
                  </div>

                  {contacts.map((contact) => {
                    const fullName = [
                      contact.first_name,
                      contact.last_name,
                    ]
                      .filter(Boolean)
                      .join(" ");

                    const initials = [
                      contact.first_name,
                      contact.last_name,
                    ]
                      .filter(Boolean)
                      .map((part) => part?.[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <div
                        className="contactTableRow"
                        key={contact.id}
                      >
                        <div className="contactPerson">
                          <div className="contactAvatar">
                            {initials}
                          </div>

                          <div>
                            <strong>
                              {fullName}
                            </strong>

                            <span>
                              {contact.job_title ??
                                "Должность не указана"}
                            </span>

                            {contact.is_decision_maker && (
                              <em>ЛПР</em>
                            )}
                          </div>
                        </div>

                        <div className="contactCompany">
                          <strong>
                            {contact.company_name}
                          </strong>

                          <span>
                            {contact.company_code}
                          </span>
                        </div>

                        <div className="contactChannels">
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                            >
                              {contact.email}
                            </a>
                          )}

                          {contact.phone && (
                            <a
                              href={`tel:${contact.phone}`}
                            >
                              {contact.phone}
                            </a>
                          )}

                          {contact.telegram && (
                            <span>
                              {contact.telegram}
                            </span>
                          )}

                          {!contact.email &&
                            !contact.phone &&
                            !contact.telegram && (
                              <span>
                                Не указаны
                              </span>
                            )}
                        </div>

                        <div>
                          <span className="channelBadge">
                            {channelNames[
                              contact.preferred_channel
                            ] ??
                              contact.preferred_channel}
                          </span>
                        </div>

                        <div>
                          <span
                            className={
                              `contactStatusBadge ${
                                contact.do_not_contact
                                  ? "blocked"
                                  : contact.contact_status
                                      .toLowerCase()
                                      .replace(" ", "-")
                              }`
                            }
                          >
                            {contact.do_not_contact
                              ? "Не связываться"
                              : statusNames[
                                  contact.contact_status
                                ] ??
                                contact.contact_status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <aside className="createPanel">
            <div className="formHeader">
              <div className="formIcon">＋</div>

              <div>
                <h2>Новый контакт</h2>

                <p>
                  Поля со звёздочкой обязательны
                </p>
              </div>
            </div>

            {companies.length === 0 ? (
              <div className="contactNoCompanies">
                <strong>
                  Сначала добавь компанию
                </strong>

                <p>
                  Контакт обязательно должен быть
                  связан с компанией.
                </p>

                <Link href="/companies">
                  Перейти к компаниям
                </Link>
              </div>
            ) : (
              <form
                action={createContactAction}
                className="companyForm"
              >
                <label>
                  Компания *
                  <select
                    name="company_id"
                    required
                    defaultValue=""
                  >
                    <option
                      value=""
                      disabled
                    >
                      Выбери компанию
                    </option>

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

                <div className="formColumns">
                  <label>
                    Имя *
                    <input
                      name="first_name"
                      required
                      maxLength={150}
                      placeholder="Анна"
                    />
                  </label>

                  <label>
                    Фамилия
                    <input
                      name="last_name"
                      maxLength={150}
                      placeholder="Иванова"
                    />
                  </label>
                </div>

                <label>
                  Должность
                  <input
                    name="job_title"
                    maxLength={255}
                    placeholder="HR Director"
                  />
                </label>

                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    maxLength={320}
                    placeholder="anna@company.com"
                  />
                </label>

                <label>
                  Телефон
                  <input
                    name="phone"
                    type="tel"
                    maxLength={100}
                    placeholder="+375..."
                  />
                </label>

                <label>
                  Telegram
                  <input
                    name="telegram"
                    maxLength={255}
                    placeholder="@username"
                  />
                </label>

                <label>
                  LinkedIn
                  <input
                    name="linkedin_url"
                    type="url"
                    placeholder="https://linkedin.com/in/..."
                  />
                </label>

                <label>
                  Предпочтительный канал
                  <select
                    name="preferred_channel"
                    defaultValue="Email"
                  >
                    <option value="Email">
                      Email
                    </option>
                    <option value="Phone">
                      Телефон
                    </option>
                    <option value="Telegram">
                      Telegram
                    </option>
                    <option value="LinkedIn">
                      LinkedIn
                    </option>
                    <option value="Other">
                      Другой
                    </option>
                  </select>
                </label>

                <label>
                  Статус
                  <select
                    name="contact_status"
                    defaultValue="Active"
                  >
                    <option value="Active">
                      Активный
                    </option>
                    <option value="Inactive">
                      Неактивный
                    </option>
                    <option value="Left company">
                      Ушёл из компании
                    </option>
                    <option value="Unknown">
                      Неизвестно
                    </option>
                  </select>
                </label>

                <label className="checkboxLabel">
                  <input
                    name="is_decision_maker"
                    type="checkbox"
                  />
                  Лицо, принимающее решение
                </label>

                <label className="checkboxLabel">
                  <input
                    name="do_not_contact"
                    type="checkbox"
                  />
                  Не связываться
                </label>

                <label>
                  Постоянное примечание
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={2000}
                    placeholder="Только постоянный контекст, не история коммуникаций"
                  />
                </label>

                <button
                  className="submitButton"
                  type="submit"
                >
                  Создать контакт
                </button>
              </form>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
EOF

echo
echo "==> 7/9 Добавление health-check"

cat > app/api/health/contacts/route.ts <<'EOF'
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getDb().query<{
      contacts: string;
      companies: string;
    }>(
      `
        SELECT
          (
            SELECT COUNT(*)::TEXT
            FROM sales.contacts
          ) AS contacts,

          (
            SELECT COUNT(*)::TEXT
            FROM sales.companies
          ) AS companies
      `,
    );

    return NextResponse.json({
      status: "ok",
      module: "contacts",
      database: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Contacts health-check failed:",
      error,
    );

    return NextResponse.json(
      {
        status: "error",
        module: "contacts",
      },
      {
        status: 500,
      },
    );
  }
}
EOF

echo
echo "==> 8/9 Добавление стилей"

cat >> app/globals.css <<'EOF'

.contactTable {
  min-width: 980px;
}

.contactTableRow {
  display: grid;
  grid-template-columns:
    minmax(210px, 1.2fr)
    minmax(170px, 1fr)
    minmax(210px, 1.2fr)
    minmax(120px, 0.7fr)
    minmax(130px, 0.8fr);
  gap: 16px;
  align-items: center;
  min-height: 78px;
  padding: 0 18px;
  border-bottom: 1px solid var(--border-soft);
}

.contactTableRow:not(.contactTableHead):hover {
  background: var(--surface-hover);
}

.contactTableHead {
  min-height: 45px;
  background: var(--surface-soft);
  color: #65758a;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.contactPerson {
  display: flex;
  align-items: center;
  gap: 11px;
}

.contactAvatar {
  width: 39px;
  height: 39px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #242f50;
  color: #c8ceff;
  font-size: 11px;
  font-weight: 900;
}

.contactPerson strong,
.contactPerson span,
.contactCompany strong,
.contactCompany span {
  display: block;
}

.contactPerson strong,
.contactCompany strong {
  font-size: 13px;
}

.contactPerson span,
.contactCompany span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
}

.contactPerson em {
  display: inline-flex;
  margin-top: 5px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(112, 108, 246, 0.14);
  color: #aaa7ff;
  font-size: 9px;
  font-style: normal;
  font-weight: 900;
}

.contactChannels {
  display: grid;
  gap: 4px;
}

.contactChannels a,
.contactChannels span {
  max-width: 230px;
  overflow: hidden;
  color: #aebbd0;
  font-size: 11px;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contactChannels a:hover {
  color: #9692ff;
}

.channelBadge,
.contactStatusBadge {
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.channelBadge {
  background: rgba(96, 165, 250, 0.1);
  color: #82b8f9;
}

.contactStatusBadge.active {
  background: rgba(74, 222, 128, 0.1);
  color: #77e99d;
}

.contactStatusBadge.inactive,
.contactStatusBadge.unknown,
.contactStatusBadge.left-company {
  background: rgba(148, 163, 184, 0.1);
  color: #a7b2c1;
}

.contactStatusBadge.blocked {
  background: rgba(251, 113, 133, 0.1);
  color: #fb8ca0;
}

.formColumns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.companyForm textarea {
  width: 100%;
  padding: 11px 12px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: 9px;
  outline: none;
  background: var(--surface-soft);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
}

.companyForm textarea:focus {
  border-color: var(--primary);
  box-shadow:
    0 0 0 3px rgba(112, 108, 246, 0.12);
}

.checkboxLabel {
  display: flex !important;
  grid-template-columns: none !important;
  flex-direction: row;
  align-items: center;
  gap: 9px !important;
  cursor: pointer;
}

.checkboxLabel input {
  width: 16px;
  height: 16px;
  padding: 0;
  accent-color: var(--primary);
}

.contactNoCompanies {
  padding: 28px 18px;
}

.contactNoCompanies strong {
  display: block;
  font-size: 14px;
}

.contactNoCompanies p {
  margin: 9px 0 17px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.contactNoCompanies a {
  display: inline-flex;
  min-height: 39px;
  align-items: center;
  padding: 0 13px;
  border-radius: 9px;
  background: var(--primary);
  color: white;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}

@media (max-width: 620px) {
  .formColumns {
    grid-template-columns: 1fr;
  }
}
EOF

echo
echo "==> 9/9 Сборка и тестирование"

if ! docker compose build --no-cache --progress=plain \
  2>&1 | tee /tmp/contacts-build.log
then
  echo
  echo "❌ Ошибка сборки Contacts."
  echo

  grep -n -B 12 -A 35 \
    -E "Failed to compile|Type error|Error:|Build error" \
    /tmp/contacts-build.log \
    | tail -n 140 || true

  exit 1
fi

docker compose up -d --force-recreate

echo "Ожидаю запуск..."

READY=0

for attempt in $(seq 1 40); do
  CONTACTS_CODE="$(
    curl \
      --silent \
      --output /tmp/contacts-page.html \
      --write-out '%{http_code}' \
      http://127.0.0.1:3000/contacts \
      || true
  )"

  HEALTH_CODE="$(
    curl \
      --silent \
      --output /tmp/contacts-health.json \
      --write-out '%{http_code}' \
      http://127.0.0.1:3000/api/health/contacts \
      || true
  )"

  if [[ "$CONTACTS_CODE" == "200" &&
        "$HEALTH_CODE" == "200" ]]; then
    READY=1
    break
  fi

  sleep 2
done

if [[ "$READY" -ne 1 ]]; then
  echo
  echo "❌ Модуль Contacts не прошёл проверку."
  echo "Contacts HTTP: $CONTACTS_CODE"
  echo "Health HTTP:   $HEALTH_CODE"
  echo

  cat /tmp/contacts-health.json 2>/dev/null || true

  echo
  docker logs "$APP_CONTAINER" --tail 160

  exit 1
fi

echo
echo "✅ Contacts health-check:"
cat /tmp/contacts-health.json
echo

echo
echo "Проверка таблицы:"

docker exec \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  psql \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -c "
    SELECT
      COUNT(*) AS contacts
    FROM sales.contacts;
  "

echo
echo "=================================================="
echo "✅ Модуль Contacts установлен"
echo
echo "Открыть:"
echo "  https://sales.cardigansarena.ru/contacts"
echo
echo "Резервная копия:"
echo "  $BACKUP_DIR"
echo "=================================================="
echo

read -r -p "Сохранить Contacts в GitHub? [y/N]: " PUSH_CONFIRM

case "$PUSH_CONFIRM" in
  y|Y|yes|YES)
    git add \
      scripts/install-contacts.sh \
      app/contacts \
      app/api/health/contacts \
      lib/repositories/contact.repository.ts \
      types/contact.ts \
      app/globals.css

    if git diff --cached --quiet; then
      echo "Нет новых изменений для коммита."
    else
      git commit -m "Add Contacts module"
      git push origin main

      echo "✅ Contacts сохранён в GitHub."
    fi
    ;;

  *)
    echo "GitHub не изменён."
    echo "Модуль уже работает на сервере."
    ;;
esac
