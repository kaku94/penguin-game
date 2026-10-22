package com.flightrec.auth;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** /api/** 요청은 X-Invite-Code 헤더에 유효한 초대코드가 있어야 통과한다. */
@Component
public class InviteCodeFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Invite-Code";
    public static final String ATTRIBUTE = "com.flightrec.auth.InviteCode";

    private final InviteCodeRepository repository;

    public InviteCodeFilter(InviteCodeRepository repository) {
        this.repository = repository;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/")
                || "OPTIONS".equals(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String code = request.getHeader(HEADER);
        InviteCode invite = code == null ? null : repository.findById(code.trim())
                .filter(InviteCode::isActive)
                .orElse(null);
        if (invite == null) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("""
                    {"status":401,"title":"Unauthorized","detail":"유효한 초대코드를 %s 헤더로 보내주세요."}"""
                    .formatted(HEADER));
            return;
        }
        request.setAttribute(ATTRIBUTE, invite);
        chain.doFilter(request, response);
    }
}
