import { getCountries, getCountryCallingCode } from "libphonenumber-js";

export type CountryDialCode = {
  iso2: string;
  name: string;
  dialCode: string;
  flag: string;
};

export const DEFAULT_COUNTRY_ISO2 = "BR";

const displayNames = new Intl.DisplayNames(["pt-BR"], { type: "region" });

export function countryFlagEmoji(iso2: string): string {
  const code = iso2.toUpperCase();
  if (code.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)));
}

function buildCountryDialCodes(): CountryDialCode[] {
  const countries = getCountries().map((iso2) => ({
    iso2,
    name: displayNames.of(iso2) ?? iso2,
    dialCode: `+${getCountryCallingCode(iso2)}`,
    flag: countryFlagEmoji(iso2),
  }));

  countries.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const brIndex = countries.findIndex((country) => country.iso2 === DEFAULT_COUNTRY_ISO2);
  if (brIndex > 0) {
    const [brasil] = countries.splice(brIndex, 1);
    countries.unshift(brasil);
  }

  return countries;
}

export const COUNTRY_DIAL_CODES = buildCountryDialCodes();

export function findCountryByIso2(iso2: string): CountryDialCode | undefined {
  return COUNTRY_DIAL_CODES.find((country) => country.iso2 === iso2);
}
