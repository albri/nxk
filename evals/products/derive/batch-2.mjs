// Second batch of the answer key: gambling by activity (Gambling Commission) and financial products (FCA), from
// batch-2-figures.json as extracted from the regulators' tables. Adds a description with no brand name and a condition
// on the generated people for each group.
//   node batch-2.mjs items2.json ../ideas/known2-spec.json
import fs from "node:fs";
const [itemsFile, specFile] = process.argv.slice(2);
const AGE = (label) => { const m = String(label).match(/(\d+)\D+(\d+)/); return m ? `age_years=${m[1]}..${m[2]}` : /75/.test(label) ? "age_years=75..100" : null; };
const RENTED = "rented_from_a_council_or_local_authority|rented_from_a_housing_association_or_other_social_landlord|rented_from_a_private_landlord_or_letting_agency|rented_from_a_relative_friend_or_employer_or_other_private_rented";
const COND = {
  "All males": "sex_at_birth=male", "All females": "sex_at_birth=female", Male: "sex_at_birth=male", Female: "sex_at_birth=female",
  "Own outright": "home_tenure=owned_outright", Mortgage: "home_tenure=owned_with_a_mortgage_or_loan", Renting: `home_tenure=${RENTED}`,
  // The FCA's income bands do not line up with the people file's; each is mapped to the bands that fall wholly inside it.
  "Less than £15k": "household_income_before_tax_per_year=under_15000_gbp",
  "£15k - <£30k": "household_income_before_tax_per_year=15000_to_24999_gbp",
  "£30k - <£50k": "household_income_before_tax_per_year=35000_to_49999_gbp",
  "£50k - <£70k": "household_income_before_tax_per_year=50000_to_69999_gbp",
  "£70k - <£100k": "household_income_before_tax_per_year=70000_to_99999_gbp",
  "£100k - <£250k": "household_income_before_tax_per_year=100000_to_149999_gbp|150000_gbp_or_more",
};
const DESCRIBE = {
  lottery_draw: "tickets for a national lottery draw. You pick six numbers for £2 and the jackpot is several million pounds. Draws are twice a week, and you can play in a shop or online.",
  charity_lottery: "a charity lottery. You pay £1 a week by Direct Debit, part of it goes to a charity such as a hospice or an air ambulance, and there is a weekly draw with a top prize of a few thousand pounds.",
  scratchcards: "scratchcards sold at shop tills for £1 to £5 each. You scratch off the panel and see at once whether you have won a cash prize.",
  online_instant_win: "instant win games that you play on your phone for 50p to £5 a go. You tap to reveal the symbols and see at once whether you have won a cash prize.",
  sports_betting_online: "a phone app for betting on football, horse racing and other sports, including bets placed while a match is being played.",
  bingo_venue: "an evening at a bingo hall near you, with games through the night, cash prizes, and food and drink brought to your table.",
  online_casino: "an online casino where you play roulette, blackjack and other casino games for money on your phone or computer.",
  football_pools: "the football pools. You pay a small stake each week and pick the matches you think will end in a draw, with cash prizes every week.",
  premium_bonds: "a government-backed savings product that pays no interest. Each £1 you put in is entered into a monthly prize draw, with tax-free prizes from £25 to £1 million, and you can take your money out at any time.",
  stocks_shares_isa: "an account for investing in shares and funds, in which any gains are free of tax. The value of what you put in can go down as well as up.",
  crypto: "an app for buying and holding cryptocurrencies, digital coins whose price can rise or fall sharply.",
  bnpl: "a way to pay for online shopping in three interest-free instalments, or a month later, offered at the checkout. There is no fee if you pay on time.",
  catalogue_credit: "a shopping catalogue account. You order clothes and household goods from it and spread the cost over weekly or monthly payments, with interest.",
  high_cost_credit: "a short-term loan of a few hundred pounds, paid into your account the same day and repaid over a few weeks or months at a high rate of interest.",
  pet_insurance: "insurance that pays the vet's bills if your pet is ill or injured, for a monthly premium.",
  phone_insurance: "insurance that repairs or replaces your mobile phone if it is lost, stolen or damaged, for a monthly premium.",
  annual_travel_insurance: "travel insurance that covers every trip abroad you take in a year under one policy.",
  private_medical: "private medical insurance. It pays for treatment in private hospitals so that you can avoid waiting lists, for a monthly premium.",
  emoney_account: "a current account run entirely through a phone app by a company that is not a traditional bank, with instant notifications when you spend and no fees for spending abroad.",
};
const items = JSON.parse(fs.readFileSync(new URL("./batch-2-figures.json", import.meta.url), "utf8")).map((row) => ({
  id: row.id, description: DESCRIBE[row.id], what: row.what, source: row.source, url: row.url, population: row.population, measure: row.measure,
  groups: row.figures.map((f) => ({ dimension: f.dimension, label: f.group, percent: f.percent, cond: COND[f.group] ?? AGE(f.group) })),
}));
for (const item of items) { if (!item.description) throw new Error(`No description for ${item.id}`); for (const g of item.groups) if (!g.cond) throw new Error(`No condition for ${item.id} ${g.label}`); }
fs.writeFileSync(itemsFile, JSON.stringify(items, null, 1));
fs.writeFileSync(specFile, JSON.stringify({
  surveyed: "November 2026",
  versions: Object.fromEntries(items.map((item) => [item.id, `You see an advert for ${item.description}`])),
  questions: { act: { type: "choice", text: "What would you do?", options: ["Take it up", "Look into it further, but not take it up yet", "Ignore it"] } },
  watch: ["act", "Take it up"],
}, null, 1));
console.log(`${items.length} items, ${items.reduce((n, item) => n + item.groups.length, 0)} published figures`);
