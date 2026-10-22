import type { Link } from "./types";

/** PRD F7: 같은 조건이 채워진 검색 링크. 추정가를 사용자가 직접 검증하는 용도. */
export function bookingLinks(origin: string, destination: string, depart: string, ret: string, adults: number): Link[] {
  const yymmdd = (d: string) => d.slice(2).replaceAll("-", "");
  const yyyymmdd = (d: string) => d.replaceAll("-", "");
  const google =
    "https://www.google.com/travel/flights?hl=ko&curr=KRW&q=" +
    encodeURIComponent(`Flights from ${origin} to ${destination} on ${depart} through ${ret} nonstop ${adults} adult`);
  const skyscanner = `https://www.skyscanner.co.kr/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${yymmdd(depart)}/${yymmdd(ret)}/?adultsv2=${adults}&rtn=1`;
  const naver = `https://flight.naver.com/flights/international/${origin}-${destination}-${yyyymmdd(depart)}/${destination}-${origin}-${yyyymmdd(ret)}?adult=${adults}&fareType=Y`;
  return [
    { name: "Google 항공권", url: google },
    { name: "스카이스캐너", url: skyscanner },
    { name: "네이버 항공권", url: naver },
  ];
}
