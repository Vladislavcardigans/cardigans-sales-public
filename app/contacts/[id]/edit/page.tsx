import Link from "next/link";
import { notFound } from "next/navigation";

import {
  SalesSidebar,
} from "@/components/layout/SalesSidebar";

import {
  DatabaseStatus,
} from "@/components/ui/DatabaseStatus";

import { getDb } from "@/lib/db";

import {
  updateContactAction,
} from "./actions";

export const dynamic = "force-dynamic";

type EditableContact = {
  id: string;
  company_id: string;
  company_name: string;

  first_name: string;
  last_name: string | null;
  job_title: string | null;

  email: string | null;
  phone: string | null;
  telegram: string | null;
  linkedin_url: string | null;

  preferred_channel: string;
  contact_status: string;

  is_decision_maker: boolean;
  do_not_contact: boolean;

  notes: string | null;
};

async function getEditableContact(
  id: string,
): Promise<EditableContact | null> {
  const result =
    await getDb().query<EditableContact>(
      `
        SELECT
          contact.id,
          contact.company_id,
          company.display_name AS company_name,

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

          contact.notes

        FROM sales.contacts AS contact

        INNER JOIN sales.companies AS company
          ON company.id = contact.company_id

        WHERE contact.id = $1
      `,
      [id],
    );

  return result.rows[0] ?? null;
}

type EditContactPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditContactPage({
  params,
}: EditContactPageProps) {
  const { id } = await params;

  const contact =
    await getEditableContact(id);

  if (!contact) {
    notFound();
  }

  const fullName = [
    contact.first_name,
    contact.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  const updateAction =
    updateContactAction.bind(
      null,
      contact.id,
    );

  return (
    <div className="appShell">
      <SalesSidebar
        activeSection="contacts"
      />

      <main className="mainContent">
        <header className="topbar">
          <div className="breadcrumbs">
            <Link href="/contacts">
              Контакты
            </Link>

            <strong>/</strong>

            <Link
              href={`/contacts/${contact.id}`}
            >
              {fullName}
            </Link>

            <strong>/</strong>

            <span>Редактирование</span>
          </div>

          <DatabaseStatus />
        </header>

        <section className="pageHeader">
          <div>
            <div className="eyebrow">
              Профиль контакта
            </div>

            <h1>Редактирование</h1>

            <p>
              {contact.company_name}
            </p>
          </div>
        </section>

        <section className="contactEditLayout">
          <form
            action={updateAction}
            className="contactEditForm"
          >
            <div className="contactEditSection">
              <div className="contactEditSectionHeader">
                <h2>Основная информация</h2>

                <p>
                  Имя и должность контакта
                </p>
              </div>

              <div className="contactEditFields">
                <div className="formColumns">
                  <label>
                    Имя *
                    <input
                      name="first_name"
                      required
                      maxLength={255}
                      defaultValue={
                        contact.first_name
                      }
                    />
                  </label>

                  <label>
                    Фамилия
                    <input
                      name="last_name"
                      maxLength={255}
                      defaultValue={
                        contact.last_name ?? ""
                      }
                    />
                  </label>
                </div>

                <label>
                  Должность
                  <input
                    name="job_title"
                    maxLength={255}
                    defaultValue={
                      contact.job_title ?? ""
                    }
                    placeholder="Например, CEO"
                  />
                </label>
              </div>
            </div>

            <div className="contactEditSection">
              <div className="contactEditSectionHeader">
                <h2>Каналы связи</h2>

                <p>
                  Контактная информация
                </p>
              </div>

              <div className="contactEditFields">
                <div className="formColumns">
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      maxLength={320}
                      defaultValue={
                        contact.email ?? ""
                      }
                    />
                  </label>

                  <label>
                    Телефон
                    <input
                      name="phone"
                      maxLength={100}
                      defaultValue={
                        contact.phone ?? ""
                      }
                    />
                  </label>
                </div>

                <div className="formColumns">
                  <label>
                    Telegram
                    <input
                      name="telegram"
                      maxLength={255}
                      defaultValue={
                        contact.telegram ?? ""
                      }
                      placeholder="@username"
                    />
                  </label>

                  <label>
                    LinkedIn
                    <input
                      name="linkedin_url"
                      type="url"
                      maxLength={1000}
                      defaultValue={
                        contact.linkedin_url ?? ""
                      }
                      placeholder="https://linkedin.com/in/..."
                    />
                  </label>
                </div>

                <label>
                  Предпочтительный канал
                  <select
                    name="preferred_channel"
                    defaultValue={
                      contact.preferred_channel
                    }
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
              </div>
            </div>

            <div className="contactEditSection">
              <div className="contactEditSectionHeader">
                <h2>Статус</h2>

                <p>
                  Коммерческая роль контакта
                </p>
              </div>

              <div className="contactEditFields">
                <label>
                  Статус контакта
                  <select
                    name="contact_status"
                    defaultValue={
                      contact.contact_status
                    }
                  >
                    <option value="Active">
                      Активный
                    </option>

                    <option value="Inactive">
                      Неактивный
                    </option>

                    <option value="Former">
                      Бывший контакт
                    </option>
                  </select>
                </label>

                <label className="contactEditCheckbox">
                  <input
                    name="is_decision_maker"
                    type="checkbox"
                    defaultChecked={
                      contact.is_decision_maker
                    }
                  />

                  <span>
                    Лицо, принимающее решения
                  </span>
                </label>

                <label className="contactEditCheckbox">
                  <input
                    name="do_not_contact"
                    type="checkbox"
                    defaultChecked={
                      contact.do_not_contact
                    }
                  />

                  <span>
                    Не связываться
                  </span>
                </label>
              </div>
            </div>

            <div className="contactEditSection">
              <div className="contactEditSectionHeader">
                <h2>Примечание</h2>

                <p>
                  Важный контекст для менеджеров
                </p>
              </div>

              <div className="contactEditFields">
                <label>
                  Комментарий
                  <textarea
                    name="notes"
                    rows={6}
                    maxLength={5000}
                    defaultValue={
                      contact.notes ?? ""
                    }
                  />
                </label>
              </div>
            </div>

            <div className="contactEditActions">
              <Link
                className="secondaryButton companyActionLink"
                href={`/contacts/${contact.id}`}
              >
                Отмена
              </Link>

              <button
                className="submitButton"
                type="submit"
              >
                Сохранить изменения
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
