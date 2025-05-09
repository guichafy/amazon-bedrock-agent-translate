import json
from src import app

def test_lambda_handler_success(monkeypatch):
    def mock_invoke_model(**kwargs):
        class Body:
            def read(self):
                return json.dumps({"results": [{"output_text": "Hello, how are you?"}]})
        return {"body": Body()}

    monkeypatch.setattr(app.boto3.client("bedrock-runtime", region_name="us-east-1"), "invoke_model", mock_invoke_model)
    event = {"body": json.dumps({"text": "Olá, como vai você?"})}
    result = app.lambda_handler(event, None)
    assert result["statusCode"] == 200
    assert "translation" in json.loads(result["body"])

def test_lambda_handler_no_text():
    event = {"body": json.dumps({})}
    result = app.lambda_handler(event, None)
    assert result["statusCode"] == 400
