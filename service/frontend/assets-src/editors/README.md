# 에디터 아바타 원본 (배포 제외)

민철(intj) · 하은(infp) · 준서(istj) · 소율(esfp) 4인의 1024×1024 PNG 원본이다.
`public/` 밖에 두는 이유는 **배포 산출물에서 빼기 위해서**다 — `deploy.sh` 는 `out/` 을
통째로 S3 에 sync 하므로 `public/` 에 있으면 아무도 안 받는 6.4MB 가 매 배포마다 따라간다.

화면에 실제로 그려지는 최대 크기는 120px(`EditorDetailClient.tsx` 프로필 헤더)이고
레터 목록 아바타는 28px 다. 그래서 서비스가 쓰는 건 `public/editors/*.webp` (320px) 이고,
이 폴더의 PNG 는 **재인코딩용 소스**로만 존재한다.

## 재생성

```bash
cd service/frontend
for f in intj infp istj esfp; do
  sips -Z 320 "assets-src/editors/$f.png" --out "/tmp/$f-320.png"
  cwebp -q 82 "/tmp/$f-320.png" -o "public/editors/$f.webp"
done
```

더 큰 렌더가 필요해지면 320 을 올려서 다시 뽑되, 참조는 `.webp` 그대로 두면 된다.

## 주의

`preorder/public/editors/` 에 같은 PNG 4장의 사본이 있었으나, `preorder/` 폴더 자체를
2026-08-04 에 삭제했다(경위는 repo 루트 `README.md` 의 CloudFront 표 아래 주석 참조).
지금 이 4장이 본 repo 의 유일한 원본이다.
