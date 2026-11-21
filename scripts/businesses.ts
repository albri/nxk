// Whether an offer, a request or a group is about businesses rather than people. nxk's people are adults, so its
// counts are of adults even when the buyer is a business; these say when that applies, and give the lines that tell
// the owner so. Firms are counted apart, from the people's firm weights (scripts/people.ts, unit firms), by the
// facts about a firm that FIRM_FACT names.
import type { Condition } from "./groups.ts";

/**
 * Whether a condition is on a person's role at work that a business-to-business count would turn on (running a
 * business, buying for an organisation, its size): such a group counts adults, not businesses, so the number of adults
 * who run their own business is not a number of firms to sell to.
 */
export const ROLE =
  /^work\.(?:purchasing_role_[a-z_]+|decision_role|organisation_size|organisation_purchasing_process|employment_type|employer_sector)$/;
/**
 * Whether an offer or a request is sold to businesses or organisations rather than to people, from how it is written:
 * "for small shops, restaurants and offices", "HR software for small businesses", "an app for trade businesses",
 * "for plumbers, electricians and HVAC businesses", "for a one-person plumbing, electrical or HVAC business",
 * "£8 per employee", "$29 per user", "5 seats". An offer read this way is asked about where people work
 * (soldToOrganisations), where the people who buy for a firm are; one missed here is asked about only at home.
 */
const ORGS = [
  "businesses|business(?!\\s+(?:trips?|travel|class|hours|days?|casual|cards?|suits?|school|degree|studies))|business owners",
  "shops|stores|restaurants|cafes|cafés|bars|pubs|salons|offices|firms|companies",
  "landlords|letting agents|estate agents|realtors|home inspectors|property managers|HOAs?",
  "practices|clinics|surgeries|schools|employers|contractors|builders|homebuilders|home builders|remodell?ers|developers|charities",
].join("|");
const LIST = "(?:[a-z-]+(?:\\s+[a-z-]+){0,2},\\s+){1,4}(?:[a-z-]+\\s+){0,2}(?:and|or|&)\\s+";
const TO_BUSINESSES = new RegExp(
  [
    `\\b(?:for|to)\\s+(?:${LIST})?(?:[a-z-]+\\s+){0,2}(?:${ORGS})\\b`,
    "\\bcommercial (?:sites|premises|properties|clients|customers)\\b",
    "\\bper (?:employee|seat|user|licen[cs]e|business|site|location)\\b",
    "\\b\\d+\\s+(?:seats|users) (?:or more|minimum)\\b",
    "\\bat least \\d+ (?:seats|users)\\b",
    "\\bB2B\\b",
  ].join("|"),
  "i",
);
export const sellsToBusinesses = (text: string | null | undefined): boolean => TO_BUSINESSES.test(String(text ?? ""));
/** The organisation purchases each working person's part in buying is recorded for (purchasing_role_<category>). */
export const CATEGORIES: string[] = [
  "software_and_saas",
  "it_hardware",
  "marketing_and_advertising",
  "professional_services",
  "recruitment_and_staffing",
  "facilities_and_office",
  "raw_materials_and_inventory",
  "equipment_and_machinery",
  "travel_and_fleet",
  "insurance",
  "utilities_and_energy",
  "food_and_hospitality_supplies",
];
/** What soldToOrganisations reads of a saved offer, lead or segment. */
export interface SavedOffer {
  /** The buying category it was asked at work under. */
  at_work?: string | null;
  offer?: string | null;
}

/** Whether a saved offer, lead or segment is sold to organisations: scanned at work (at_work), or written so. */
export const soldToOrganisations = (item: SavedOffer | null | undefined): boolean =>
  Boolean(item?.at_work) || sellsToBusinesses(item?.offer);
export const BUSINESS_NOTE = [
  "Sold to businesses: the buyer is a business, and nxk's people are adults.",
  "Counts here are of people (the staff who would use it, the person who signs up for their employer), not of businesses.",
  "How many businesses there are: count firms (people, unit firms) by their size, sector, industry, how they buy and where,",
  "or give a published count (UK: ONS UK Business Counts; US: Census Bureau County Business Patterns), sourced.",
].join(" ");
/** The line terms and discover have the reply keep when the buyer is a business (scripts/log.ts keepLine). */
export const PEOPLE_NOT_BUSINESSES = "These counts are of adults, not of businesses.";

/** Whether a group written as conditions ("employer_sector=...,couple_status=...") is cut by a role at work (ROLE). */
export const roleIn = (among: string | null | undefined): boolean =>
  String(among ?? "")
    .split(",")
    .some((c) =>
      ROLE.test(
        `work.${c
          .split(/!?=/)[0]
          .trim()
          .replace(/^work\./, "")}`,
      ),
    );
export const ROLE_NOTE = [
  "These count adults by their work, not businesses: one business can have several of them (owners, buyers, managers) and many have none.",
  "For a number of businesses, count firms (people, unit firms) by the firm's size, sector, industry, how it buys and where;",
  "any other kind of business needs a published count",
  "(US: Census Bureau County Business Patterns and Nonemployer Statistics; UK: ONS UK Business Counts), labelled sourced.",
].join(" ");

/**
 * The facts firms are counted by (scripts/population.ts firmsAmong): facts everyone at a firm shares, so that its
 * people's weights add up to one whole firm. Its size, its sector, its industry, how it buys, and where its people
 * live, which stands in for where it is (most firms are small, and their people live near them). Who signs off its
 * purchases is not one: each person answers it from where they sit ("me", "my line manager").
 */
export const FIRM_FACT =
  /^(?:work\.(?:organisation_size|organisation_purchasing_process|employer_sector|employer_industry_section|employer_industry)|place\.[a-z_]+)$/;
/** The organisation_size of a person's own business with nobody else in it: there, the person is the firm. */
export const ONE_PERSON = "self_employed_with_no_employees";
/**
 * The conditions of a count of firms that are about a person rather than their firm (FIRM_FACT), or [] when firms can
 * be counted by all of them. Summed over the people a fact about the person picks, the weights are parts of firms (a
 * firm counts by the share of its people who are aged 25 to 34), not firms. A group of one-person businesses alone
 * (organisation_size=self_employed_with_no_employees) is the exception: there every fact about the person is one about
 * their firm. `conditions` are scripts/groups.ts conditionsOf's.
 */
export function notAboutFirms<C extends Pick<Condition, "path" | "codes">>(conditions: C[]): C[] {
  const onePerson = conditions.some(
    (c) => c.path === "work.organisation_size" && c.codes?.length && c.codes.every((code) => code === ONE_PERSON),
  );
  return onePerson ? [] : conditions.filter((c) => !FIRM_FACT.test(c.path));
}
