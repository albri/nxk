// Assemble the answer key: published figures by group for real products, each with a description that names no
// brand, and each group mapped to a condition on the generated people.
//   node batch-1.mjs items.json ../ideas/known-spec.json
import fs from "node:fs";
const [itemsFile, specFile] = process.argv.slice(2);
const map = JSON.parse(fs.readFileSync(new URL("../../../maps/uk.json", import.meta.url), "utf8"));
const grade = (prefix) => `social_grade=${map.fields.find((f) => f.name === "social_grade").values.find((v) => v.code.startsWith(prefix)).code}`;
const COND = {
  "16-24": "age_years=18..24", "25-34": "age_years=25..34", "35-44": "age_years=35..44", "45-54": "age_years=45..54", "55-64": "age_years=55..64", "65-74": "age_years=65..74", "75+": "age_years=75..100",
  "18-34": "age_years=18..34", "55+": "age_years=55..100",
  MAN: "sex_at_birth=male", WOMAN: "sex_at_birth=female", Men: "sex_at_birth=male", Women: "sex_at_birth=female",
  AB: grade("ab_"), C1: grade("c1_"), C2: grade("c2_"), DE: grade("de_"),
  "Owner occupiers": "home_tenure=owned_outright|owned_with_a_mortgage_or_loan|shared_ownership",
  "Private renters": "home_tenure=rented_from_a_private_landlord_or_letting_agency|rented_from_a_relative_friend_or_employer_or_other_private_rented",
  "Social renters": "home_tenure=rented_from_a_council_or_local_authority|rented_from_a_housing_association_or_other_social_landlord",
  "Rural areas": "settlement_size=small_town_of_1000_to_9999_people|village_hamlet_or_open_countryside",
  "Urban areas": "settlement_size=city_or_conurbation_of_1_million_or_more_people|city_or_conurbation_of_250000_to_999999_people|town_or_city_of_10000_to_249999_people",
};
const DIMENSION = { MAN: "sex", WOMAN: "sex", Men: "sex", Women: "sex", AB: "social grade", C1: "social grade", C2: "social grade", DE: "social grade", "Owner occupiers": "tenure", "Private renters": "tenure", "Social renters": "tenure", "Rural areas": "rural or urban", "Urban areas": "rural or urban" };
const FREE = "It is free to use.";
const DESCRIBE = {
  tiktok_use: `a phone app that shows an endless stream of short videos made by other users, chosen for you from what you watch. You can post your own videos too. ${FREE}`,
  snapchat_use: `a phone app for sending photos and short videos to friends, which disappear after they are seen, with filters that change how you look. ${FREE}`,
  facebook_use: `an online service where you connect with friends and family, share photos and news, join groups for your interests and your local area, and buy and sell things locally. It comes with a messaging app and is free to use.`,
  instagram_use: `a phone app for sharing photos and short videos, and for following friends, celebrities and brands. ${FREE}`,
  x_twitter_use: `an online service where people post short public messages about news, politics, sport and entertainment as things happen, and you follow the accounts that interest you. ${FREE}`,
  linkedin_use: `an online service where you keep a profile of your career, connect with colleagues and people in your line of work, and look for jobs. ${FREE}`,
  pinterest_use: `an online service for collecting and browsing pictures of ideas: home decoration, recipes, outfits, crafts and party planning. ${FREE}`,
  reddit_use: `an online service made up of thousands of discussion forums, each on one subject, where people post under made-up names and vote the best answers to the top. ${FREE}`,
  ai_apps_ever_used: `an AI assistant that you type questions to in plain English. It answers them, writes and rewrites text, and summarises documents. ${FREE}`,
};
const items = [];
// Ofcom, Adults' Media Literacy tracker 2025 data tables: every figure checked against the table rows.
for (const row of JSON.parse(fs.readFileSync(new URL("./ofcom.json", import.meta.url), "utf8"))) {
  if (!DESCRIBE[row.id]) continue; // streaming video, streamed audio and console games are facts the people file already holds
  items.push({ id: row.id, description: DESCRIBE[row.id], source: row.source, url: row.url, population: row.population, measure: "uses it", groups: row.figures.map((f) => ({ dimension: DIMENSION[f.group] ?? "age", label: f.group, percent: f.percent, cond: COND[f.group] })) });
}
// English Housing Survey 2023-24, low carbon technologies fact sheet (gov.uk): sentences read from the page.
const EHS = "English Housing Survey 2023 to 2024: low carbon technologies in English homes, fact sheet (MHCLG)";
const EHS_URL = "https://www.gov.uk/government/statistics/english-housing-survey-2023-to-2024-low-carbon-technologies-in-english-homes-fact-sheet/english-housing-survey-2023-to-2024-low-carbon-technologies-in-english-homes-fact-sheet";
const group = (label, percent) => ({ dimension: DIMENSION[label] ?? "age", label, percent, cond: COND[label] });
items.push({ id: "ev_hybrid", description: "an electric or hybrid car to replace your current car, on a monthly finance plan.", source: EHS, url: EHS_URL, population: "households in England with a car or van", measure: "has an electric or hybrid vehicle", groups: [group("Owner occupiers", 13), group("Private renters", 8), group("Social renters", 6), group("Rural areas", 14), group("Urban areas", 11)] });
items.push({ id: "solar_pv", description: "solar panels fitted to the roof of your home, which generate electricity and cut your bills. They cost several thousand pounds to install.", source: EHS, url: EHS_URL, population: "dwellings in England", measure: "has solar panels", groups: [group("Owner occupiers", 7), group("Social renters", 5), group("Private renters", 2), group("Rural areas", 11), group("Urban areas", 5)] });
items.push({ id: "heat_pump", description: "a heat pump to replace your home's boiler, heating your home with electricity. It costs several thousand pounds to install, with a government grant towards it.", source: EHS, url: EHS_URL, population: "dwellings in England", measure: "heats the home with a heat pump", groups: [group("Rural areas", 8), group("Urban areas", 0.5)] });
// FCA Financial Lives 2022, key findings page: one sentence read from the page.
items.push({ id: "mobile_wallet", description: `a way to pay in shops by holding your phone to the card reader, with your bank card stored in the phone. ${FREE}`, source: "Financial Lives 2022 survey: key findings (FCA)", url: "https://www.fca.org.uk/publications/financial-lives/financial-lives-survey-2022-key-findings", population: "UK adults 18+", measure: "used it in the last 12 months", groups: [group("18-34", 74), group("55+", 23), group("Men", 52), group("Women", 43)] });
for (const item of items) for (const g of item.groups) if (!g.cond) throw new Error(`No condition for ${item.id} ${g.label}`);
fs.writeFileSync(itemsFile, JSON.stringify(items, null, 1));
fs.writeFileSync(specFile, JSON.stringify({
  surveyed: "November 2026",
  versions: Object.fromEntries(items.map((item) => [item.id, `You see an advert for ${item.description}`])),
  questions: { act: { type: "choice", text: "What would you do?", options: ["Take it up", "Look into it further, but not take it up yet", "Ignore it"] } },
  watch: ["act", "Take it up"],
}, null, 1));
console.log(`${items.length} items, ${items.reduce((n, item) => n + item.groups.length, 0)} published figures`);
