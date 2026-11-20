"""Parcours de la PR 3 sur un build lancé avec npm start.

Exemple : python tests/browser/analyse.py http://localhost:3000 --axe /chemin/axe.min.js
Utilise Playwright pour Python et Chromium en dehors des dépendances du projet.
"""

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


STORAGE_KEY = "boussole-budget-v2"
TODAY = datetime(2026, 12, 10, 11, tzinfo=timezone.utc)
BASE_BUDGET = {
    "currentBalance": 100000,
    "balanceDate": "2026-12-10",
    "userProfile": {
        "id": "local", "firstName": "Lou", "situation": "single", "hasChildren": False,
        "isInMediation": False, "safetyReserve": 5000, "currency": "EUR",
    },
    "incomes": [], "expenses": [], "debts": [], "goals": [], "childExpenses": [],
    "documents": [],
    "mediationFile": {"status": "not_started", "steps": [], "questionsForMediator": []},
}


def spending(id, date, cents):
    return {
        "id": id, "date": date, "amount": cents, "category": "groceries", "label": id,
        "balanceIncluded": False, "debited": True, "balanceRevision": 0,
    }


def expense(id, label, category, cents, date, *, paid=False, paid_dates=None):
    item = {
        "id": id, "label": label, "category": category, "amount": cents, "dueDate": date,
        "isPaid": paid, "isRecurring": True, "frequency": "monthly",
    }
    if paid_dates:
        item["occurrenceStatuses"] = {due: "paid" for due in paid_dates}
    return item


def start(browser, url, budget, *, offline=False):
    context = browser.new_context(
        base_url=url, viewport={"width": 390, "height": 844}, is_mobile=True,
        has_touch=True, locale="fr-BE", timezone_id="Europe/Brussels", reduced_motion="reduce",
        service_workers="allow" if offline else "block",
    )
    data = json.dumps({"version": 2, "state": {**BASE_BUDGET, **budget}})
    context.add_init_script(
        f"if (!localStorage.getItem('{STORAGE_KEY}')) localStorage.setItem('{STORAGE_KEY}', {json.dumps(data)});"
    )
    page = context.new_page()
    page.clock.set_fixed_time(TODAY)
    page.set_default_timeout(7000)
    return context, page


def open_analysis(page):
    response = page.goto("/analyse")
    assert response is not None and response.ok, f"/analyse : {response.status if response else 'sans réponse'}"
    expect(page.get_by_role("heading", name="Où part mon argent")).to_be_visible()


def eur(amount):
    return rf"{re.escape(amount)}\s*€"


def category(page, title):
    return page.get_by_role("button", name=re.compile(rf"^{re.escape(title)} "))


def open_detail(page, title):
    category(page, title).click()
    dialog = page.get_by_role("dialog", name=title, exact=True)
    expect(dialog).to_be_visible()
    return dialog


def check_axe(page, source):
    assert page.evaluate("document.documentElement.scrollWidth") == 390
    if not source:
        return
    page.evaluate(source)
    results = page.evaluate("""async () => (await axe.run({runOnly: [
        'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa',
    ]})).violations.map(({id, nodes}) => ({id, targets: nodes.map(({target}) => target)}))""")
    assert results == [], results


def stored(page):
    return page.evaluate(f"JSON.parse(localStorage.getItem('{STORAGE_KEY}')).state")


def test_first_month(browser, url, axe):
    budget = {
        "spendings": [spending("Colruyt", "2026-12-03", 4228)],
        "expenses": [expense("rent", "Loyer", "rent", 65000, "2026-12-01", paid=True)],
        "debts": [{
            "id": "debt", "creditor": "ING", "type": "personal", "frequency": "monthly",
            "initialAmount": 50000, "remainingAmount": 40000, "monthlyPayment": 4000,
            "status": "to_pay", "isMediationIncluded": False, "nextDueDate": "2026-12-05",
            "occurrenceStatuses": {"2026-12-05": "paid"},
        }],
        "balanceGaps": [{"id": "gap", "fromDate": "2026-12-01", "date": "2026-12-10", "amount": 20000}],
    }
    context, page = start(browser, url, budget, offline=True)
    page.goto("/budget")
    page.get_by_role("link", name=re.compile("^Où part mon argent")).click()
    expect(page.get_by_role("heading", name="Où part mon argent")).to_be_visible()
    expect(page.get_by_role("link", name="Budget", exact=True)).to_have_attribute("aria-current", "location")
    expect(page.get_by_text(re.compile(eur("932,28")))).to_be_visible()
    expect(category(page, "Courses")).to_contain_text("Pas de comparaison")
    honesty = page.get_by_text("Une partie de tes dépenses n’est pas encodée : l’analyse est incomplète.")
    expect(honesty).to_be_visible()
    check_axe(page, axe)

    for title, action, target in [("Logement", "Voir mes charges", "/charges"), ("Dettes", "Voir mes dettes", "/dettes")]:
        detail = open_detail(page, title)
        expect(detail.get_by_role("button", name="Créer une enveloppe")).to_have_count(0)
        expect(detail.get_by_role("link", name=action)).to_have_attribute("href", target)
        check_axe(page, axe)
        detail.get_by_role("button", name="Fermer").click()

    detail = open_detail(page, "Courses")
    expect(detail.get_by_text(re.compile(rf"Ce mois-ci : {eur('42,28')}"))).to_be_visible()
    detail.get_by_role("button", name="Créer une enveloppe").click()
    form = page.get_by_role("dialog", name="Créer une enveloppe", exact=True)
    expect(form.locator("input[name=amount]")).to_have_value("")
    expect(form.get_by_text("Indique ce que tu veux réserver chaque mois.")).to_be_visible()
    check_axe(page, axe)
    form.get_by_role("button", name="Fermer").click()
    if detail.is_visible():
        detail.get_by_role("button", name="Fermer").click()

    detail = open_detail(page, "Non encodé")
    expect(detail.get_by_role("button", name="Créer une enveloppe")).to_have_count(0)
    expect(detail.get_by_text("Différence entre ton solde recopié de la banque et ce que tu as encodé. Encode tes dépenses pour réduire cette ligne.")).to_be_visible()
    check_axe(page, axe)
    detail.get_by_role("button", name="Ajouter une dépense").click()
    form = page.get_by_role("dialog", name="Nouvelle dépense")
    form.locator("input[name=quickEntry]").fill("30 Colruyt")
    form.locator("input[name=date]").fill("2026-12-08")
    expect(form.get_by_role("checkbox", name="Déjà comprise dans mon solde")).to_be_checked()
    form.get_by_role("button", name="Ajouter la dépense").click()
    expect(form).to_have_count(0)
    if detail.is_visible():
        detail.get_by_role("button", name="Fermer").click()
    expect(category(page, "Non encodé")).to_contain_text(re.compile(eur("170,00")))
    expect(honesty).to_have_count(0)
    assert stored(page)["currentBalance"] == 100000

    page.goto("/depenses")
    page.get_by_role("link", name="Voir où part mon argent").click()
    expect(page.get_by_role("heading", name="Où part mon argent")).to_be_visible()
    page.goto("/plus")
    expect(page.get_by_text("Mode hors ligne prêt.", exact=True)).to_be_visible(timeout=20000)
    context.set_offline(True)
    open_analysis(page)
    expect(category(page, "Non encodé")).to_contain_text(re.compile(eur("170,00")))
    context.close()


def test_average(browser, url, axe):
    context, page = start(browser, url, {
        "spendings": [spending("Novembre", "2026-11-03", 3000), spending("Décembre", "2026-12-03", 4228)],
        "expenses": [expense("charge-courses", "Courses récurrentes", "groceries", 3300, "2026-12-20",
                             paid_dates=["2026-11-20"])],
    })
    open_analysis(page)
    expect(category(page, "Courses")).to_contain_text(re.compile(rf"−{eur('20,72')} par rapport à novembre"))
    page.get_by_role("button", name="Mois précédent").click()
    expect(category(page, "Courses")).to_contain_text(re.compile(eur("63,00")))
    page.get_by_role("button", name="Mois suivant").click()
    expect(page.get_by_role("button", name="Mois suivant")).to_be_disabled()
    detail = open_detail(page, "Courses")
    expect(detail.get_by_text(re.compile(rf"Tu y as dépensé en moyenne {eur('63,00')} par mois\."))).to_be_visible()
    detail.get_by_role("button", name="Créer une enveloppe").click()
    form = page.get_by_role("dialog", name="Créer une enveloppe", exact=True)
    expect(form.locator("input[name=amount]")).to_have_value("65")
    expect(form.get_by_role("button", name="Remplacer la charge par cette enveloppe")).to_be_visible()
    check_axe(page, axe)
    context.close()


def test_preview(browser, url, axe):
    context, page = start(browser, url, {
        "envelopes": [{"id": "courses", "category": "groceries", "label": "Courses", "monthlyAmount": 40000}],
        "spendings": [spending("Colruyt", "2026-12-03", 10000), spending("Delhaize", "2026-12-07", 5000)],
    })
    open_analysis(page)
    detail = open_detail(page, "Courses")
    expect(detail.get_by_text("Colruyt", exact=True)).to_be_visible()
    expect(detail.get_by_text("Delhaize", exact=True)).to_be_visible()
    expect(detail.get_by_role("button", name="Créer une enveloppe")).to_have_count(0)
    field = detail.get_by_role("spinbutton", name=re.compile("Nouveau montant mensuel"))
    field.fill("300")
    expect(detail.get_by_text(re.compile(rf"Ton vrai disponible passerait de {eur('300,00')} à {eur('500,00')}"))).to_be_visible()
    assert stored(page)["envelopes"][0]["monthlyAmount"] == 40000
    check_axe(page, axe)
    detail.get_by_role("button", name="Appliquer").click()
    page.goto("/dashboard")
    expect(page.get_by_text(re.compile(eur("500,00"))).first).to_be_visible()
    assert stored(page)["envelopes"][0]["monthlyAmount"] == 30000
    context.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--axe", type=Path)
    parser.add_argument("--chromium")
    args = parser.parse_args()
    axe_source = args.axe.read_text() if args.axe else None
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium)
        for test in (test_first_month, test_average, test_preview):
            test(browser, args.url, axe_source)
            print(f"{test.__name__} OK", flush=True)
