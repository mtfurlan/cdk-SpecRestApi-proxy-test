import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { aws_apigateway as apigateway } from 'aws-cdk-lib';
import { aws_s3_deployment as s3Deployment } from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import * as fs from 'fs';


export class CdkApiTestStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);


        const helloFunction = new NodejsFunction(this, 'function', {
            entry: 'lib/hello-world.function.ts',
        });

        const swaggerText = fs.readFileSync("swagger.json", 'utf-8');
        const swaggerConfig = JSON.parse(swaggerText);
        swaggerConfig.paths["/prod/hello-world"].get["x-amazon-apigateway-integration"].uri = `arn:aws:apigateway:${props!.env!.region!}:lambda:path/2015-03-31/functions/${helloFunction.functionArn}/invocations`;

        const apigw = new apigateway.SpecRestApi(this, 'apigw', {
            apiDefinition: apigateway.AssetApiDefinition.fromInline(swaggerConfig),
        });

        helloFunction.addPermission('PermitAPIGInvocation', {
            principal: new cdk.aws_iam.ServicePrincipal('apigateway.amazonaws.com'),
            sourceArn: apigw.arnForExecuteApi('*')
        });


        const s3Bucket = new s3.Bucket( this, "docs-bucket",
            {
                websiteIndexDocument: 'index.html',
                publicReadAccess: true,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
                blockPublicAccess: new s3.BlockPublicAccess({
                    blockPublicAcls: false,
                    ignorePublicAcls: false,
                    blockPublicPolicy: false,
                    restrictPublicBuckets: false,
                }),
                autoDeleteObjects: true,
            });

        // upload base api docs + swagger doc to S3 bucket
        const s3bucketDeployment =  new s3Deployment.BucketDeployment(this, 'DeployApiDocsBase', {
            sources: [
                s3Deployment.Source.asset('./docs/apiDocsBase'),
                s3Deployment.Source.jsonData('swagger.json', swaggerConfig),
            ],
            destinationBucket: s3Bucket,
        });


        // IAM Role to allow S3 access from API Gateway
        var s3Role = new cdk.aws_iam.Role(this, "S3FrontendRole", {
            assumedBy: new cdk.aws_iam.ServicePrincipal('apigateway.amazonaws.com'),
        });
        s3Bucket.grantReadWrite(s3Role);

        // Proxy Integration for frontend
        const websiteFolder = apigw.root.addResource('{proxy+}', {
            defaultMethodOptions: {
                requestParameters: {
                    'method.request.path.proxy': true
                }
            },
        });

        // S3 Integration
        const webFolderIntegration = new apigateway.AwsIntegration({
            service: "s3",
            integrationHttpMethod: "GET",
            path: s3Bucket.bucketName + "/{proxy}",
            options: {
                credentialsRole: s3Role,
                passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_MATCH,
                requestParameters: {
                    'integration.request.path.proxy': 'method.request.path.proxy',
                },
                integrationResponses: [
                    {
                        statusCode: '200',
                        responseParameters: {
                            'method.response.header.Content-Type': 'integration.response.header.Content-Type'
                        }
                    }
                ]
            }
        });

        // S3 Integration Method
        websiteFolder.addMethod('GET', webFolderIntegration, {
            methodResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Content-Type': true
                    }
                }
            ]
        });

        // Integration index.html (if no file is specified)
        const getS3IntegrationIndex = new apigateway.AwsIntegration({
            service: "s3",
            integrationHttpMethod: "GET",
            path: s3Bucket.bucketName + "/index.html",
            options: {
                credentialsRole: s3Role,
                integrationResponses: [
                    {
                        statusCode: '200',
                        responseParameters: {
                            'method.response.header.Content-Type': 'integration.response.header.Content-Type'
                        }
                    }
                ]
            }
        });

        // S3 Integration Method
        apigw.root.addMethod("GET", getS3IntegrationIndex, {
            methodResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Content-Type': true
                    }
                }
            ]
        });
    }
}
