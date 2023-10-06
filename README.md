# SpecRestApi {proxy+} issue demonstrator
This stack has a lambda at /hello-world and also hosts the contents of the
`docs` dir with {proxy+} so you can view the openapi specification in a fancy
GUI.


The issue is that if you change the openAPI specification, the {proxy+} endpoint
dissippears, you can see it before and after in the console.


To see the issue:
* deploy this stack
* see that the swagger UI works
* change a description in `swagger.json`
* redeploy
* see that the swagger UI doesn't work

