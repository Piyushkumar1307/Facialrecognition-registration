# FaceCheck celebrity demo import

Use [facecheck-dhoni-kohli-demo.csv](facecheck-dhoni-kohli-demo.csv) for the `/adduser` upload. It is UTF-8 CSV, so it opens directly in Excel, Google Sheets, and Numbers.

`facecheck-dhoni-kohli-demo.xlsx` is an editing-friendly companion. The app intentionally accepts CSV only; after editing the workbook, save it as **CSV UTF-8** before uploading.

The two `faceImageUrl` values are direct public JPEG links rather than embedded photos, because FaceCheck downloads and enrolls the reference image from that column. The ages are sample values correct on 11 October 2026 and should be updated if you reuse the file later.

## Image attribution and demo-only use

- MS Dhoni image: [Wikimedia Commons source](https://commons.wikimedia.org/wiki/File:MS_Dhoni_2016.jpg), credited to Amardeep Singh, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Virat Kohli image: [Wikimedia Commons source](https://commons.wikimedia.org/wiki/File:Virat_Kohli_portrait.jpg), credited to Anand Anil, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

These rows are for a local product demo only. Face photos and face embeddings are sensitive biometric data; do not enroll anyone without their informed consent and appropriate authority.
