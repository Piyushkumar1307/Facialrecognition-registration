# FaceCheck celebrity demo import

Use [facecheck-dhoni-kohli-demo.csv](facecheck-dhoni-kohli-demo.csv) for the `/adduser` upload. It is UTF-8 CSV, so it opens directly in Excel, Google Sheets, and Numbers.

`facecheck-dhoni-kohli-demo.xlsx` is an editing-friendly companion. The app intentionally accepts CSV only; after editing the workbook, save it as **CSV UTF-8** before uploading.

The two `faceImageUrl` values are direct public JPEG links rather than embedded photos, because FaceCheck downloads and enrolls the reference image from that column. The ages are sample values correct on 11 October 2026 and should be updated if you reuse the file later.

## Image sources and demo-only use

The spreadsheet uses the two Cloudinary image assets supplied by the project owner. The MS Dhoni URL includes Cloudinary's `f_jpg` delivery transform because the stored asset is WebP while AWS Rekognition accepts JPEG and PNG reference bytes.

These rows are for a local product demo only. Face photos and face embeddings are sensitive biometric data; do not enroll anyone without their informed consent and appropriate authority.
