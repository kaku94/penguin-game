package com.flightrec.config;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.flightrec.auth.InviteCode;
import com.flightrec.auth.InviteCodeRepository;
import com.flightrec.search.destination.CityMapping;
import com.flightrec.search.destination.CityMappingRepository;

/** 초대코드와 (국가, 목적) → 후보 도시 매핑 초기 데이터. 이미 있으면 건드리지 않는다. */
@Component
public class DataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private static final List<CityMapping> CITY_MAPPINGS = List.of(
            new CityMapping("일본", "맛집", "오사카", "KIX", "'구이다오레(먹다 망하는)'의 도시, 도톤보리·쿠로몬 시장"),
            new CityMapping("일본", "맛집", "후쿠오카", "FUK", "비행 1시간대, 라멘·모츠나베·야타이"),
            new CityMapping("일본", "맛집", "도쿄", "NRT,HND", "스시·이자카야 선택지가 가장 많음"),
            new CityMapping("일본", "온천", "후쿠오카", "FUK", "유후인·벳푸 접근이 쉬움"),
            new CityMapping("일본", "온천", "삿포로", "CTS", "조잔케이·노보리베츠 온천"),
            new CityMapping("일본", "온천", "오사카", "KIX", "아리마 온천 당일치기"),
            new CityMapping("일본", "쇼핑", "도쿄", "NRT,HND", "긴자·시부야·하라주쿠"),
            new CityMapping("일본", "쇼핑", "오사카", "KIX", "신사이바시·난바"),
            new CityMapping("일본", "휴양", "오키나와", "OKA", "바다·리조트"),
            new CityMapping("동남아", "휴양", "다낭", "DAD", "해변 리조트, 물가 저렴"),
            new CityMapping("동남아", "휴양", "세부", "CEB", "다이빙·리조트"),
            new CityMapping("동남아", "맛집", "방콕", "BKK", "길거리 음식·미쉐린 빕구르망"),
            new CityMapping("동남아", "맛집", "타이베이", "TPE", "야시장·우육면·딤섬"));

    private final AppProperties props;
    private final InviteCodeRepository inviteCodes;
    private final CityMappingRepository cityMappings;

    public DataSeeder(AppProperties props, InviteCodeRepository inviteCodes, CityMappingRepository cityMappings) {
        this.props = props;
        this.inviteCodes = inviteCodes;
        this.cityMappings = cityMappings;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (AppProperties.InviteCodeSeed seed : props.inviteCodes()) {
            if (!inviteCodes.existsById(seed.code())) {
                inviteCodes.save(new InviteCode(seed.code(), seed.name(), seed.dailyLimit()));
                log.info("초대코드 생성: {}", seed.name());
            }
        }
        if (cityMappings.count() == 0) {
            cityMappings.saveAll(CITY_MAPPINGS);
            log.info("도시 매핑 {}건 생성", CITY_MAPPINGS.size());
        }
    }
}
