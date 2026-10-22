package com.flightrec.profile;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfileService {

    private final UserProfileRepository repository;

    public ProfileService(UserProfileRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public UserProfile get(String inviteCode) {
        return repository.findById(inviteCode).orElseGet(() -> UserProfile.defaults(inviteCode));
    }

    @Transactional
    public UserProfile update(String inviteCode, List<String> homeAirports, CarrierPreference preference) {
        UserProfile profile = repository.findById(inviteCode).orElseGet(() -> UserProfile.defaults(inviteCode));
        profile.update(homeAirports, preference);
        return repository.save(profile);
    }
}
