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

1. **You bootstrap once, with your own login.** This is the only step that needs wide rights.
   Create the policy from `iam/cfn-exec-policy.json` (name it `quizlike-cfn-exec`), then:

       aws iam create-policy --policy-name quizlike-cfn-exec --policy-document file://iam/cfn-exec-policy.json
       npx cdk bootstrap aws://ACCOUNT_ID/us-east-1 --cloudformation-execution-policies arn:aws:iam::ACCOUNT_ID:policy/quizlike-cfn-exec

   CDK's default would give deployments full administrator rights. This replaces that with the
   short list of cheap services, plus a deny list of the expensive ones.

2. **Make a `deployer` IAM user for Claude.** It may only assume the CDK roles and read the bill
   (`iam/deployer-policy.json`). Make an access key for it and store it yourself, in your own terminal:

       aws iam create-user --user-name deployer
       aws iam put-user-policy --user-name deployer --policy-name quizlike-deployer --policy-document file://iam/deployer-policy.json
       aws iam create-access-key --user-name deployer     # copy the two values
       aws configure --profile quizlike                   # paste them there, region us-east-1

   Never paste the secret into a chat or a file. Claude uses `--profile quizlike` and nothing else.

Before any of this: MFA on root, a card with a low limit, budgets at 1 and 5 dollars, and
Free Tier alerts on.

## Putting the ImageKit settings in (once, by you)

    aws ssm put-parameter --profile quizlike --name /quizlike/imagekit/public-key  --type SecureString --value "..."
    aws ssm put-parameter --profile quizlike --name /quizlike/imagekit/private-key --type SecureString --value "..."
    aws ssm put-parameter --profile quizlike --name /quizlike/imagekit/url-endpoint --type SecureString --value "..."

SecureString with the default AWS key is free. Do not use Secrets Manager.
