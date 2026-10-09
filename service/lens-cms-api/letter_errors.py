"""이슈 레터·주제 사전 공용 오류. 입력·상태 규칙 위반을 라우트가 상태 코드로 바꿔 돌려준다."""


class LetterError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status
