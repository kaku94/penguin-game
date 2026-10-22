package com.flightrec.profile;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flightrec.auth.InviteCode;
import com.flightrec.auth.InviteCodeFilter;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

@Tag(name = "프로필", description = "기본 출발 공항 등 사용자 설정")
@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final ProfileService service;

    public ProfileController(ProfileService service) {
        this.service = service;
    }

    @Operation(summary = "내 프로필 조회", description = "저장한 적이 없으면 기본값(ICN, GMP / 항공사 무관)을 돌려줍니다.")
    @GetMapping
    public ProfileResponse get(@Parameter(hidden = true) @RequestAttribute(InviteCodeFilter.ATTRIBUTE) InviteCode invite) {
        return ProfileResponse.from(service.get(invite.getCode()));
    }

    @Operation(summary = "내 프로필 저장")
    @PutMapping
    public ProfileResponse update(@Parameter(hidden = true) @RequestAttribute(InviteCodeFilter.ATTRIBUTE) InviteCode invite,
                                  @Valid @RequestBody ProfileRequest request) {
        return ProfileResponse.from(service.update(invite.getCode(), request.homeAirports(), request.carrierPreference()));
    }

    public record ProfileRequest(
            @Schema(description = "기본 출발 공항 IATA 코드", example = "[\"ICN\", \"GMP\"]")
            @NotEmpty List<@Pattern(regexp = "[A-Za-z]{3}", message = "IATA 3글자 코드여야 합니다") String> homeAirports,
            @Schema(description = "선호 항공사 유형", example = "ANY")
            @NotNull CarrierPreference carrierPreference) {
    }

    public record ProfileResponse(List<String> homeAirports, CarrierPreference carrierPreference) {
        static ProfileResponse from(UserProfile p) {
            return new ProfileResponse(p.getHomeAirports(), p.getCarrierPreference());
        }
    }
}
