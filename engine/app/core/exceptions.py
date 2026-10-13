class ANAHATError(Exception):
    """Base engine error."""


# Therapist-safe user messages.
USER_MESSAGE_UNAVAILABLE = (
    "Nadika is temporarily unavailable. Please retry in a few seconds."
)

USER_MESSAGE_NOT_CONFIGURED = (
    "Nadika is not configured correctly. Please contact the administrator."
)


class LLMServiceError(ANAHATError):
    """Base class for therapist-safe LLM service failures."""

    def __init__(
        self,
        message=None,
        *,
        user_message=None,
        retryable=False,
        http_status=502,
        code="LLM_SERVICE_ERROR",
        category="service_error",
        provider=None,
    ):
        super().__init__(message or user_message or "")
        self.user_message = user_message or str(self)
        self.retryable = retryable
        self.http_status = http_status
        self.code = code
        self.category = category
        self.provider = provider

    def __str__(self):
        return self.user_message


class LLMProviderError(ANAHATError):
    """Internal/provider-level failure.

    Technical details may be retained here for logging and fallback decisions,
    but must not be exposed directly to the therapist.
    """

    def __init__(
        self,
        message,
        *,
        category="provider_error",
        provider=None,
        is_configuration=False,
        model=None,
        status_code=None,
        retry_after=None,
    ):
        super().__init__(message)
        self.category = category
        self.provider = provider
        self.is_configuration = is_configuration
        self.model = model
        self.status_code = status_code
        self.retry_after = retry_after

class LLMProviderExhaustedError(LLMProviderError):
    def __init__(self, errors):
        self.errors = list(errors)
        self.is_configuration = bool(self.errors) and all(
            getattr(error, "is_configuration", False)
            for error in self.errors
        )

        last_error = self.errors[-1] if self.errors else None
        message = str(last_error) if last_error else "LLM provider attempts exhausted"

        super().__init__(
            message,
            category=getattr(last_error, "category", "provider_exhausted"),
            provider=getattr(last_error, "provider", None),
            is_configuration=self.is_configuration,
            model=getattr(last_error, "model", None),
            status_code=getattr(last_error, "status_code", None),
            retry_after=getattr(last_error, "retry_after", None),
        )

class LLMConfigurationError(LLMProviderError):
    def __init__(
        self,
        message,
        *,
        category="configuration",
        provider=None,
        model=None,
        status_code=None,
        retry_after=None,
    ):
        super().__init__(
            message,
            category=category,
            provider=provider,
            is_configuration=True,
            model=model,
            status_code=status_code,
            retry_after=retry_after,
        )


class LLMTemporaryError(LLMProviderError):
    def __init__(
        self,
        message,
        *,
        category="temporary",
        provider=None,
        model=None,
        status_code=None,
        retry_after=None,
    ):
        super().__init__(
            message,
            category=category,
            provider=provider,
            is_configuration=False,
            model=model,
            status_code=status_code,
            retry_after=retry_after,
        )


class LLMInvalidResponseError(LLMProviderError):
    def __init__(
        self,
        message,
        *,
        category="invalid_response",
        provider=None,
        model=None,
        status_code=None,
        retry_after=None,
    ):
        super().__init__(
            message,
            category=category,
            provider=provider,
            is_configuration=False,
            model=model,
            status_code=status_code,
            retry_after=retry_after,
        )
        
class LLMUnavailableError(LLMServiceError):
    def __init__(self):
        super().__init__(
            user_message=USER_MESSAGE_UNAVAILABLE,
            retryable=True,
            http_status=502,
            code="LLM_UNAVAILABLE",
            category="unavailable",
        )


class LLMNotConfiguredError(LLMServiceError):
    def __init__(self):
        super().__init__(
            user_message=USER_MESSAGE_NOT_CONFIGURED,
            retryable=False,
            http_status=502,
            code="LLM_NOT_CONFIGURED",
            category="configuration",
        )


class RetrievalError(ANAHATError):
    pass


class EvidenceValidationError(ANAHATError):
    pass