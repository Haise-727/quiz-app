import { Stack, RemovalPolicy, CfnOutput, Duration } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

/**
 * Static hosting for the built React app: a private S3 bucket behind CloudFront.
 * Optional. Vercel hosting is free and stays the default; deploy this only when you want the
 * app itself on AWS.
 *
 * Cost notes:
 *  - CloudFront has an Always Free allowance (1 TB out, 10 million requests a month).
 *  - The bucket is tiny (a few MB). No versioning, so old builds do not pile up.
 *  - Price class 100 (North America and Europe edges only) is the cheapest.
 *  - The default *.cloudfront.net address means no Route 53 zone (0.50 dollars a month) and no domain.
 */
export class WebStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // A single page app: any path that is not a file must return index.html (what vercel.json does today).
    const spaFallback = [403, 404].map((httpStatus) => ({
      httpStatus, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.seconds(0),
    }));

    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'Headers', {
          // The same headers as vercel.json.
          securityHeadersBehavior: {
            contentTypeOptions: { override: true },
            frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
            referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
          },
          customHeadersBehavior: {
            customHeaders: [{ header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()', override: true }],
          },
        }),
      },
      errorResponses: spaFallback,
    });

    new CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}
