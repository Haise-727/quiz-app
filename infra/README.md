# infra

AWS infrastructure for Quizlike, written with the CDK. Nothing here deploys by itself.

Read `docs/aws-migration.md` first, especially the Free plan section.

## What is here

| Stack | What it makes | Cost |
|---|---|---|
| `quizlike-signer` | Lambda with a Function URL that signs ImageKit uploads (code in `backend/signer`) | inside the Lambda free allowance |
| `quizlike-data` | 7 DynamoDB tables, provisioned 1 read and 1 write unit each (17 of the free 25) | inside the DynamoDB free allowance |
| `quizlike-web` | private S3 bucket behind CloudFront, optional | inside the CloudFront free allowance, cents for S3 |

The app keeps using Firebase, ImageKit and Vercel until each piece is switched on.

## Check offline (no AWS account needed)

    cd infra
    npm install
    npx cdk synth --quiet        # builds the CloudFormation templates into cdk.out
    node scripts/check-free.mjs  # fails if anything could cost money by surprise
    cd .. && node --test backend/signer/signer.test.mjs

## Giving Claude access, safely

Two layers, so a mistake cannot create expensive things.

1. **You bootstrap once, with your own login.** This is the only step that needs wide rights,
   so it uses a short lived sign in of yours, never the `deployer` key. (CloudShell can refuse
   new or unverified accounts. This works from your own terminal instead.)

       aws login --profile admin          # opens the browser, sign in as your own admin user
       cd infra
       aws iam create-policy --profile admin --policy-name quizlike-cfn-exec --policy-document file://iam/cfn-exec-policy.json
       npx cdk bootstrap aws://ACCOUNT_ID/ap-south-1 --profile admin --cloudformation-execution-policies arn:aws:iam::ACCOUNT_ID:policy/quizlike-cfn-exec

   After that the `admin` session can expire and nothing is lost. Do not give `deployer` the
   rights to do this itself: a user that can create roles can give itself admin.

   CDK's default would give deployments full administrator rights. This replaces that with the
   short list of cheap services, plus a deny list of the expensive ones.

2. **Make a `deployer` IAM user for Claude.** It may only assume the CDK roles and read the bill
   (`iam/deployer-policy.json`). Make an access key for it and store it yourself, in your own terminal:

       aws iam create-user --user-name deployer
       aws iam put-user-policy --user-name deployer --policy-name quizlike-deployer --policy-document file://iam/deployer-policy.json
       aws iam create-access-key --user-name deployer     # copy the two values
       aws configure --profile quizlike                   # paste them there, region ap-south-1

   Never paste the secret into a chat or a file. Claude uses `--profile quizlike` and nothing else.

Before any of this: MFA on root, a card with a low limit, budgets at 1 and 5 dollars, and
Free Tier alerts on.

## Putting the ImageKit settings in (once, by you)

    aws ssm put-parameter --profile quizlike --name /quizlike/imagekit/public-key  --type SecureString --value "..."
    aws ssm put-parameter --profile quizlike --name /quizlike/imagekit/private-key --type SecureString --value "..."
    aws ssm put-parameter --profile quizlike --name /quizlike/imagekit/url-endpoint --type SecureString --value "..."

SecureString with the default AWS key is free. Do not use Secrets Manager.

## Deploying and the emergency brake

    npx cdk deploy quizlike-signer   # the upload signer (done once, live)
    npm run deploy:aws               # from the repo root: builds the app and deploys quizlike-web
    node infra/scripts/panic.mjs     # dry run of the emergency brake. Add --yes to do it

`npm run deploy:aws` builds with `VITE_SIGNER_URL` from `.env.production` (not committed), so the
AWS copy asks the signer Lambda for upload tokens. The Vercel build does not read that file, so
Vercel keeps using `/api/auth`. After the first deploy, add the CloudFront address to Firebase
Authentication, Settings, Authorized domains, or Google sign in will fail on the AWS copy.

A public Function URL needs two permissions since late 2025. The signer stack sets both.
