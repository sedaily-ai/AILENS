@echo off
echo Starting Deployment...
echo.

echo Building Lambda package...
if exist lambda-build rmdir /s /q lambda-build
if exist lambda_package.zip del /q lambda_package.zip
mkdir lambda-build

pip3 install httpx==0.27.0 pydantic==2.10.0 pydantic-settings==2.6.0 python-dotenv==1.0.1 requests==2.32.3 beautifulsoup4==4.12.3 redis -t lambda-build --platform manylinux2014_x86_64 --python-version 3.11 --only-binary=:all: --upgrade --no-cache-dir --quiet

xcopy /E /I /Q clients lambda-build\clients
xcopy /E /I /Q handlers lambda-build\handlers
xcopy /E /I /Q utils lambda-build\utils
xcopy /E /I /Q prompts lambda-build\prompts
xcopy /E /I /Q config lambda-build\config
xcopy /E /I /Q core lambda-build\core
xcopy /E /I /Q models lambda-build\models
xcopy /E /I /Q repositories lambda-build\repositories
xcopy /E /I /Q services lambda-build\services
copy /Y MBTI_TRANSFORM_PROMPT.md lambda-build\

cd lambda-build
powershell -command "Compress-Archive -Path * -DestinationPath ..\lambda_package.zip -Force"
cd ..
rmdir /s /q lambda-build

echo [OK] Package created
echo.

echo Uploading to S3...
aws s3 cp lambda_package.zip s3://sedaily-mbti-lambda-packages-dev/ --quiet
echo [OK] Uploaded
echo.

echo Updating Lambda functions...
aws lambda update-function-code --function-name sedaily-mbti-time-machine-dev --s3-bucket sedaily-mbti-lambda-packages-dev --s3-key lambda_package.zip --region us-east-1 --output json --query LastModified > nul
echo [OK] sedaily-mbti-time-machine-dev updated
echo.
echo [DONE] Deployment complete!
