# Kie.ai: modelos de imagen

Extracto de la documentación de Kie.ai (docs.kie.ai) que entregó la agencia el 14-10-2026: sólo los modelos que usa o va a usar el Estudio. La original completa no está en el repositorio.

# Image Models > Seedream > Seedream5.0 Pro - Text to Image
Fuente: https://docs.kie.ai/market/seedream/5-pro-text-to-image.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Seedream5.0 Pro - Text to Image
      description: >
        High-quality photorealistic image generation powered by Seedream's
        advanced AI model

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: seedream-5-pro-text-to-image
      tags:
        - docs/en/Market/Image    Models/Seedream
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: seedream/5-pro-text-to-image
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `seedream/5-pro-text-to-image` for this endpoint
                  enum:
                    - seedream/5-pro-text-to-image
                  examples:
                    - seedream/5-pro-text-to-image
                  type: string
                                        name: ''
                      value: seedream/5-pro-text-to-image
                callBackUrl:
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      description: Text prompt, 4–5000 characters.
                      examples:
                        - >-
                          A full-process cafe design tool for entrepreneurs and
                          designers. It covers core needs including store
                          layout, functional zoning, decoration style, equipment
                          selection, and customer group adaptation, supporting
                          integrated planning of "commercial attributes +
                          aesthetic design." Suitable as a promotional image for
                          a cafe design SaaS product, with a 16:9 aspect ratio.
                      maxLength: 5000
                      minLength: 4
                      type: string
                    aspect_ratio:
                      description: >-
                        Required. Width-height ratio of the image, determining
                        its visual form.
                      enum:
                        - '1:1'
                        - '4:3'
                        - '3:4'
                        - '16:9'
                        - '9:16'
                        - '2:3'
                        - '3:2'
                        - '21:9'
                      examples:
                        - '1:1'
                      type: string
                                                name: ''
                          value: '1:1'
                        - description: ''
                          name: ''
                          value: '4:3'
                        - description: ''
                          name: ''
                          value: '3:4'
                        - description: ''
                          name: ''
                          value: '16:9'
                        - description: ''
                          name: ''
                          value: '9:16'
                        - description: ''
                          name: ''
                          value: '2:3'
                        - description: ''
                          name: ''
                          value: '3:2'
                        - description: ''
                          name: ''
                          value: '21:9'
                    quality:
                      description: >-
                        Required. Basic outputs 1K images, while High outputs 2K
                        images.
                      enum:
                        - basic
                        - high
                      examples:
                        - basic
                      type: string
                    output_format:
                      default: png
                      description: Format of the output image
                      enum:
                        - png
                        - jpeg
                      examples:
                        - png
                      type: string
                                                name: ''
                          value: png
                        - description: ''
                          name: ''
                          value: jpeg
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. When false, no additional content
                        filtering is applied and results are returned directly
                        by the model.
                  required:
                    - prompt
                    - aspect_ratio
                    - quality
                  type: object
                                                        01KX31P7PWM8T39RWCBB910HAY:
                      $ref: '#/components/schemas/nsfw_checker'
                                required:
                - model
                - input
              type: object
                                        example:
              model: seedream/5-pro-text-to-image
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A full-process cafe design tool for entrepreneurs and
                  designers. It covers core needs including store layout,
                  functional zoning, decoration style, equipment selection, and
                  customer group adaptation, supporting integrated planning of
                  "commercial attributes + aesthetic design." Suitable as a
                  promotional image for a cafe design SaaS product, with a 16:9
                  aspect ratio.
                aspect_ratio: '1:1'
                quality: basic
                output_format: png
                nsfw_checker: false

=====

# Image Models > Seedream > Seedream5.0 Pro - Image to Image
Fuente: https://docs.kie.ai/market/seedream/5-pro-image-to-image.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Seedream5.0 Pro - Image to Image
      description: >
        Image editing with Seedream 5.0 Pro

        :::tip

        The first input image is free; each additional input image adds a fee.
        For current prices, see [kie.ai/pricing](https://kie.ai/pricing).

        :::

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: seedream-5-pro-image-to-image
      tags:
        - docs/en/Market/Image    Models/Seedream
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: seedream/5-pro-image-to-image
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `seedream/5-pro-image-to-image` for this endpoint
                  enum:
                    - seedream/5-pro-image-to-image
                  examples:
                    - seedream/5-pro-image-to-image
                  type: string
                                        name: ''
                      value: seedream/5-pro-image-to-image
                callBackUrl:
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      description: Text prompt, 4–5000 characters.
                      examples:
                        - >-
                          Keep the model's pose and the flowing shape of the
                          liquid dress unchanged. Change the clothing material
                          from silver metal to completely transparent clear
                          water (or glass). Through the liquid water, the
                          model's skin details are visible. Lighting changes
                          from reflection to refraction.
                      maxLength: 5000
                      minLength: 4
                      type: string
                    image_urls:
                      description: >-
                        Upload an image file to use as input for the API (File
                        URL after upload, not file content; Accepted types:
                        image/jpeg, image/png, image/webp; Max size: 30.0MB)
                      examples:
                        - - >-
                            https://static.aiquickdraw.com/tools/example/1764851484363_ScV1s2aq.webp
                      items:
                        format: uri
                        type: string
                      maxItems: 10
                      type: array
                    aspect_ratio:
                      description: >-
                        Required. Width-height ratio of the image, determining
                        its visual form. 
                      enum:
                        - '1:1'
                        - '4:3'
                        - '3:4'
                        - '16:9'
                        - '9:16'
                        - '2:3'
                        - '3:2'
                        - '21:9'
                      examples:
                        - '1:1'
                      type: string
                                                name: ''
                          value: '1:1'
                        - description: ''
                          name: ''
                          value: '4:3'
                        - description: ''
                          name: ''
                          value: '3:4'
                        - description: ''
                          name: ''
                          value: '16:9'
                        - description: ''
                          name: ''
                          value: '9:16'
                        - description: ''
                          name: ''
                          value: '2:3'
                        - description: ''
                          name: ''
                          value: '3:2'
                        - description: ''
                          name: ''
                          value: '21:9'
                    quality:
                      description: >-
                        Required. Basic outputs 1K images, while High outputs 2K
                        images.
                      enum:
                        - basic
                        - high
                      examples:
                        - basic
                      type: string
                    output_format:
                      default: png
                      description: Format of the output image
                      enum:
                        - png
                        - jpeg
                      examples:
                        - png
                      type: string
                                                name: ''
                          value: png
                        - description: ''
                          name: ''
                          value: jpeg
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. When false, no additional content
                        filtering is applied and results are returned directly
                        by the model.
                  required:
                    - prompt
                    - image_urls
                    - aspect_ratio
                    - quality
                  type: object
                                                        01KX31NNF3HWXZ2E1R2HT933GV:
                      $ref: '#/components/schemas/nsfw_checker'
                                required:
                - model
                - input
              type: object
                                        example:
              model: seedream/5-pro-image-to-image
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Keep the model's pose and the flowing shape of the liquid
                  dress unchanged. Change the clothing material from silver
                  metal to completely transparent clear water (or glass).
                  Through the liquid water, the model's skin details are
                  visible. Lighting changes from reflection to refraction.
                image_urls:
                  - >-
                    https://static.aiquickdraw.com/tools/example/1764851484363_ScV1s2aq.webp
                aspect_ratio: '1:1'
                quality: basic
                output_format: png
                nsfw_checker: true

=====

# Image Models > Google > Google - imagen4-ultra
Fuente: https://docs.kie.ai/market/google/imagen4-ultra.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Google - imagen4-ultra
      description: >
        Image generation by Google imagen4-ultra

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: google-imagen4-ultra
      tags:
        - docs/en/Market/Image    Models/Google
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
              properties:
                model:
                  type: string
                  enum:
                    - google/imagen4-ultra
                  default: google/imagen4-ultra
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `google/imagen4-ultra` for this endpoint
                  examples:
                    - google/imagen4-ultra
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      description: >-
                        The text prompt describing what you want to see (Max
                        length: 5000 characters)
                      type: string
                      maxLength: 5000
                      examples:
                        - >-
                          A lively comic scene where two colleagues are in an
                          office. The first person says, 'Have you heard about
                          Google Imagen 4 Ultra?' The second person responds
                          with excitement, 'It’s the best text-to-image tool out
                          there!' The first person asks again, 'Do you know
                          where to get the API?' The second person smiles and
                          says, 'Kie.ai has it!' In the final panel, the two
                          look at a screen showing Kie.ai’s interface with an
                          API option, with bright and colorful comic-style
                          illustrations.
                    negative_prompt:
                      description: >-
                        A description of what to discourage in the generated
                        images (Max length: 5000 characters)
                      type: string
                      maxLength: 5000
                      examples:
                        - ''
                    aspect_ratio:
                      type: string
                      description: >-
                        Required. Aspect ratio of the output image: 1:1, 16:9,
                        9:16, 3:4, 4:3 or auto.
                      enum:
                        - '1:1'
                        - '16:9'
                        - '9:16'
                        - '3:4'
                        - '4:3'
                        - auto
                      examples:
                        - '1:1'
                                                name: ''
                          description: ''
                        - value: '16:9'
                          name: ''
                          description: ''
                        - value: '9:16'
                          name: ''
                          description: ''
                        - value: '3:4'
                          name: ''
                          description: ''
                        - value: '4:3'
                          name: ''
                          description: ''
                        - value: auto
                          name: ''
                          description: ''
                    seed:
                      description: >-
                        Random seed for reproducible generation (Max length: 500
                        characters)
                      type: string
                      maxLength: 500
                      examples:
                        - ''
                  required:
                    - prompt
                    - aspect_ratio
                                                                            example:
              model: google/imagen4-ultra
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A lively comic scene where two colleagues are in an office.
                  The first person says, 'Have you heard about Google Imagen 4
                  Ultra?' The second person responds with excitement, 'It’s the
                  best text-to-image tool out there!' The first person asks
                  again, 'Do you know where to get the API?' The second person
                  smiles and says, 'Kie.ai has it!' In the final panel, the two
                  look at a screen showing Kie.ai’s interface with an API
                  option, with bright and colorful comic-style illustrations.
                negative_prompt: ''
                aspect_ratio: '1:1'
                seed: ''

=====

# Image Models > Google > Google - Nano Banana Pro
Fuente: https://docs.kie.ai/market/google/pro-image-to-image.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Google - Nano Banana Pro
      description: >
        Image generation using Google's Pro Image to Image model

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: nano-banana-pro
      tags:
        - docs/en/Market/Image    Models/Google
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: nano-banana-pro
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `nano-banana-pro` for this endpoint
                  enum:
                    - nano-banana-pro
                  examples:
                    - nano-banana-pro
                  type: string
                callBackUrl:
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      description: >-
                        A text description of the image you want to generate
                        (Max length: 20000 characters)
                      examples:
                        - >-
                          Comic poster: cool banana hero in shades leaps from
                          sci-fi pad. Six panels: 1) 4K mountain landscape, 2)
                          banana holds page of long multilingual text with auto
                          translation, 3) Gemini 3 hologram for
                          search/knowledge/reasoning, 4) camera UI sliders for
                          angle focus color, 5) frame trio 1:1-9:16, 6)
                          consistent banana poses. Footer shows Google icons.
                          Tagline: Nano Banana Pro now on Kie AI.
                      maxLength: 20000
                      type: string
                    image_input:
                      description: >-
                        Input images to transform or use as reference (supports
                        up to 8 images) (File URL after upload, not file
                        content; Accepted types: image/jpeg, image/png,
                        image/webp; Max size: 30.0MB)
                      examples:
                        - []
                      items:
                        format: uri
                        type: string
                      maxItems: 8
                      type: array
                    aspect_ratio:
                      default: '1:1'
                      description: Aspect ratio of the generated image
                      enum:
                        - '1:1'
                        - '2:3'
                        - '3:2'
                        - '3:4'
                        - '4:3'
                        - '4:5'
                        - '5:4'
                        - '9:16'
                        - '16:9'
                        - '21:9'
                        - auto
                      examples:
                        - '1:1'
                      type: string
                    resolution:
                      default: 1K
                      description: Resolution of the generated image
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      examples:
                        - 1K
                      type: string
                    output_format:
                      description: >-
                        Output image format: png or jpg. Set this field
                        explicitly.
                      enum:
                        - png
                        - jpg
                      examples:
                        - png
                      type: string
                  required:
                    - prompt
                  type: object
                                                  required:
                - model
              type: object
                                        example:
              model: nano-banana-pro
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Comic poster: cool banana hero in shades leaps from sci-fi
                  pad. Six panels: 1) 4K mountain landscape, 2) banana holds
                  page of long multilingual text with auto translation, 3)
                  Gemini 3 hologram for search/knowledge/reasoning, 4) camera UI
                  sliders for angle focus color, 5) frame trio 1:1-9:16, 6)
                  consistent banana poses. Footer shows Google icons. Tagline:
                  Nano Banana Pro now on Kie AI.
                image_input: []
                aspect_ratio: '1:1'
                resolution: 1K
                output_format: png

=====

# Image Models > Google > Google - Nano Banana 2
Fuente: https://docs.kie.ai/market/google/nanobanana2.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Google - Nano Banana 2
      description: >
        Image generation by Nano Banana 2

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      tags:
        - docs/en/Market/Image    Models/Google
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - nano-banana-2
                  default: nano-banana-2
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `nano-banana-2` for this endpoint
                  examples:
                    - nano-banana-2
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      type: string
                      description: >-
                        A text description of the image you want to generate
                        (Max length: 20000 characters)
                      maxLength: 20000
                      examples:
                        - >-
                          Comic poster: cool banana hero in shades leaps from
                          sci-fi pad. Six panels: 1) 4K mountain landscape, 2)
                          banana holds page of long multilingual text with auto
                          translation, 3) Gemini 3 hologram for
                          search/knowledge/reasoning, 4) camera UI sliders for
                          angle focus color, 5) frame trio 1:1-9:16, 6)
                          consistent banana poses. Footer shows Google icons.
                          Tagline: Nano Banana Pro now on Kie AI.
                    image_input:
                      description: >-
                        Input images to transform or use as reference (supports
                        up to 10 images) (File URL after upload, not file
                        content; Accepted types: image/jpeg, image/png,
                        image/webp; Max size: 30.0MB)
                      type: array
                      items:
                        type: string
                        format: uri
                      maxItems: 10
                      examples:
                        - []
                    aspect_ratio:
                      type: string
                      description: Aspect ratio of the generated image
                      enum:
                        - '1:1'
                        - '2:3'
                        - '3:2'
                        - '1:4'
                        - '4:1'
                        - '3:4'
                        - '4:3'
                        - '4:5'
                        - '5:4'
                        - '1:8'
                        - '8:1'
                        - '9:16'
                        - '16:9'
                        - '21:9'
                        - auto
                      default: auto
                      examples:
                        - '1:1'
                                                name: ''
                          description: ''
                        - value: '2:3'
                          name: ''
                          description: ''
                        - value: '3:2'
                          name: ''
                          description: ''
                        - value: '1:4'
                          name: ''
                          description: ''
                        - value: '4:1'
                          name: ''
                          description: ''
                        - value: '3:4'
                          name: ''
                          description: ''
                        - value: '4:3'
                          name: ''
                          description: ''
                        - value: '4:5'
                          name: ''
                          description: ''
                        - value: '5:4'
                          name: ''
                          description: ''
                        - value: '1:8'
                          name: ''
                          description: ''
                        - value: '8:1'
                          name: ''
                          description: ''
                        - value: '9:16'
                          name: ''
                          description: ''
                        - value: '16:9'
                          name: ''
                          description: ''
                        - value: '21:9'
                          name: ''
                          description: ''
                        - value: auto
                          name: ''
                          description: ''
                    resolution:
                      description: Resolution of the generated image
                      type: string
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      default: 1K
                      examples:
                        - 1K
                    output_format:
                      description: Format of the output image
                      type: string
                      enum:
                        - png
                        - jpg
                      default: jpg
                      examples:
                        - jpg
                  required:
                    - prompt
                                                                            example:
              model: nano-banana-2
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Comic poster: cool banana hero in shades leaps from sci-fi
                  pad. Six panels: 1) 4K mountain landscape, 2) banana holds
                  page of long multilingual text with auto translation, 3)
                  Gemini 3 hologram for search/knowledge/reasoning, 4) camera UI
                  sliders for angle focus color, 5) frame trio 1:1-9:16, 6)
                  consistent banana poses. Footer shows Google icons. Tagline:
                  Nano Banana Pro now on Kie AI.
                image_input: []
                aspect_ratio: auto
                resolution: 1K
                output_format: png

=====

# Image Models > Google > Google - Nano Banana 2.1
Fuente: https://docs.kie.ai/market/google/nanobanana-2-1.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Google - Nano Banana 2.1
      description: >
        Image generation by Nano Banana 2.1

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      tags:
        - docs/en/Market/Image    Models/Google
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `nano-banana-2-1` for this endpoint
                  enum:
                    - nano-banana-2-1
                  default: nano-banana-2-1
                                        name: ''
                      description: ''
                  examples:
                    - nano-banana-2-1
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      type: string
                      description: >-
                        A text description of the image you want to generate
                        (Max length: 20000 characters)
                      maxLength: 20000
                      examples:
                        - >-
                          Comic poster: cool banana hero in shades leaps from
                          sci-fi pad. Six panels: 1) 4K mountain landscape, 2)
                          banana holds page of long multilingual text with auto
                          translation, 3) Gemini 3 hologram for
                          search/knowledge/reasoning, 4) camera UI sliders for
                          angle focus color, 5) frame trio 1:1-9:16, 6)
                          consistent banana poses. Footer shows Google icons.
                          Tagline: Nano Banana Pro now on Kie AI.
                    image_input:
                      description: >-
                        Input images to transform or use as reference (supports
                        up to 10 images) (File URL after upload, not file
                        content; Accepted types: image/jpeg, image/png,
                        image/webp; Max size: 30.0MB)
                      type: array
                      items:
                        type: string
                        format: uri
                      maxItems: 10
                      examples:
                        - []
                    aspect_ratio:
                      type: string
                      description: Aspect ratio of the generated image
                      enum:
                        - '1:1'
                        - '2:3'
                        - '3:2'
                        - '1:4'
                        - '4:1'
                        - '3:4'
                        - '4:3'
                        - '4:5'
                        - '5:4'
                        - '1:8'
                        - '8:1'
                        - '9:16'
                        - '16:9'
                        - '21:9'
                        - auto
                      default: auto
                      examples:
                        - '1:1'
                                                name: ''
                          description: ''
                        - value: '2:3'
                          name: ''
                          description: ''
                        - value: '3:2'
                          name: ''
                          description: ''
                        - value: '1:4'
                          name: ''
                          description: ''
                        - value: '4:1'
                          name: ''
                          description: ''
                        - value: '3:4'
                          name: ''
                          description: ''
                        - value: '4:3'
                          name: ''
                          description: ''
                        - value: '4:5'
                          name: ''
                          description: ''
                        - value: '5:4'
                          name: ''
                          description: ''
                        - value: '1:8'
                          name: ''
                          description: ''
                        - value: '8:1'
                          name: ''
                          description: ''
                        - value: '9:16'
                          name: ''
                          description: ''
                        - value: '16:9'
                          name: ''
                          description: ''
                        - value: '21:9'
                          name: ''
                          description: ''
                        - value: auto
                          name: ''
                          description: ''
                    resolution:
                      description: Resolution of the generated image
                      type: string
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      default: 1K
                      examples:
                        - 1K
                    output_format:
                      description: Format of the output image
                      type: string
                      enum:
                        - png
                        - jpg
                      default: jpg
                      examples:
                        - jpg
                  required:
                    - prompt
                                                                            example:
              model: nano-banana-2-1
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Comic poster: cool banana hero in shades leaps from sci-fi
                  pad. Six panels: 1) 4K mountain landscape, 2) banana holds
                  page of long multilingual text with auto translation, 3)
                  Gemini 3 hologram for search/knowledge/reasoning, 4) camera UI
                  sliders for angle focus color, 5) frame trio 1:1-9:16, 6)
                  consistent banana poses. Footer shows Google icons. Tagline:
                  Nano Banana Pro now on Kie AI.
                image_input: []
                aspect_ratio: auto
                resolution: 1K
                output_format: png

=====

# Image Models > GPT Image > GPT Image 2.5 Flare - Text to Image
Fuente: https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-text-to-image.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: GPT Image 2.5 Flare - Text to Image
      description: >-
        ## Create Task

        Use this endpoint to create a new text-to-image generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: gpt-image-2-5-flare-text-to-image
      tags:
        - docs/en/Market/Image    Models/GPT Image
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: gpt-image-2-5-flare-text-to-image
                  description: >-
                    The model name used for generation. This field is required.
                    This endpoint must use the
                    `gpt-image-2-5-flare-text-to-image` model.
                  enum:
                    - gpt-image-2-5-flare-text-to-image
                  examples:
                    - gpt-image-2-5-flare-text-to-image
                  type: string
                                        name: ''
                      value: gpt-image-2-5-flare-text-to-image
                callBackUrl:
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent. To
                    ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification).
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the text-to-image task.
                  properties:
                    prompt:
                      description: Text prompt. Required, maximum 20,000 characters.
                      examples:
                        - >-
                          A cinematic night city poster with neon reflections on
                          a rainy street.
                      maxLength: 20000
                      minLength: 1
                      type: string
                    aspect_ratio:
                      description: >-
                        The aspect ratio of the generated image is set to auto
                        by default. The 27:16, 16:27, 9:8 and 8:9 aspect ratios
                        support 1K only. 2K and 4K are available for other
                        aspect ratios.
                      enum:
                        - auto
                        - '1:1'
                        - '3:2'
                        - '2:3'
                        - '4:3'
                        - '3:4'
                        - '16:9'
                        - '9:16'
                        - '21:9'
                        - '27:16'
                        - '16:27'
                        - '9:8'
                        - '8:9'
                      type: string
                                                label: auto
                          value: auto
                        - description: ''
                          label: '1:1'
                          value: '1:1'
                        - description: ''
                          label: '3:2'
                          value: '3:2'
                        - description: ''
                          label: '2:3'
                          value: '2:3'
                        - description: ''
                          label: '4:3'
                          value: '4:3'
                        - description: ''
                          label: '3:4'
                          value: '3:4'
                        - description: ''
                          label: '16:9'
                          value: '16:9'
                        - description: ''
                          label: '9:16'
                          value: '9:16'
                        - description: ''
                          label: '21:9'
                          value: '21:9'
                        - description: ''
                          name: ''
                          value: '27:16'
                        - description: ''
                          name: ''
                          value: '16:27'
                        - description: ''
                          name: ''
                          value: '9:8'
                        - description: ''
                          name: ''
                          value: '8:9'
                    resolution:
                      description: Image resolution
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      type: string
                                                name: ''
                          value: 1K
                        - description: ''
                          name: ''
                          value: 2K
                        - description: ''
                          name: ''
                          value: 4K
                    background:
                      description: Image background
                      enum:
                        - transparent
                        - opaque
                        - auto
                      type: string
                                                name: Transparency
                          value: transparent
                        - description: ''
                          name: Opaque
                          value: opaque
                        - description: ''
                          name: Automatically
                          value: auto
                  required:
                    - prompt
                  type: object
                                                  required:
                - model
                - input
              type: object
                                        example:
              model: gpt-image-2-5-flare-text-to-image
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A cinematic night city poster with neon reflections on a rainy
                  street.
                aspect_ratio: '3:2'
                resolution: 1K
                background: transparent

=====

# Image Models > GPT Image > GPT Image 2.5 Flare - Image To Image
Fuente: https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-image-to-image.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: GPT Image 2.5 Flare - Image To Image
      description: >-
        ## Create Task

        Use this endpoint to create a new image-to-image generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: gpt-image-2-5-flare-image-to-image
      tags:
        - docs/en/Market/Image    Models/GPT Image
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: gpt-image-2-5-flare-image-to-image
                  description: >-
                    The model name used for generation. This field is required.
                    This endpoint must use the
                    `gpt-image-2-5-flare-image-to-image` model.
                  enum:
                    - gpt-image-2-5-flare-image-to-image
                  examples:
                    - gpt-image-2-5-flare-image-to-image
                  type: string
                callBackUrl:
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent. To
                    ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification).
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the image-to-image task.
                  properties:
                    prompt:
                      description: Text prompts, up to 20,000 characters.
                      examples:
                        - >-
                          Transform this product image into a premium e-commerce
                          poster style.
                      type: string
                    input_urls:
                      description: Array of input image URLs.
                      examples:
                        - - https://example.com/
                      items:
                        format: uri
                        type: string
                      maxItems: 16
                      type: array
                    aspect_ratio:
                      description: >-
                        The aspect ratio of the generated image is set to auto
                        by default. The 27:16, 16:27, 9:8 and 8:9 aspect ratios
                        support 1K only. 2K and 4K are available for other
                        aspect ratios.
                      enum:
                        - auto
                        - '1:1'
                        - '3:2'
                        - '2:3'
                        - '4:3'
                        - '3:4'
                        - '16:9'
                        - '9:16'
                        - '21:9'
                        - '27:16'
                        - '16:27'
                        - '9:8'
                        - '8:9'
                      type: string
                                                label: auto
                          value: auto
                        - description: ''
                          label: '1:1'
                          value: '1:1'
                        - description: ''
                          label: '3:2'
                          value: '3:2'
                        - description: ''
                          label: '2:3'
                          value: '2:3'
                        - description: ''
                          label: '4:3'
                          value: '4:3'
                        - description: ''
                          label: '3:4'
                          value: '3:4'
                        - description: ''
                          label: '5:4'
                          value: '5:4'
                        - description: ''
                          label: '4:5'
                          value: '4:5'
                        - description: ''
                          label: '16:9'
                          value: '16:9'
                        - description: ''
                          label: '9:16'
                          value: '9:16'
                        - description: ''
                          label: '2:1'
                          value: '2:1'
                        - description: ''
                          label: '1:2'
                          value: '1:2'
                        - description: ''
                          label: '3:1'
                          value: '3:1'
                        - description: ''
                          label: '1:3'
                          value: '1:3'
                        - description: ''
                          label: '21:9'
                          value: '21:9'
                        - description: ''
                          name: ''
                          value: '9:21'
                    resolution:
                      description: Image resolution
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      type: string
                                                name: ''
                          value: 1K
                        - description: ''
                          name: ''
                          value: 2K
                        - description: ''
                          name: ''
                          value: 4K
                    background:
                      description: 'Image background '
                      enum:
                        - transparent
                        - opaque
                        - auto
                      type: string
                                                label: Transparency
                          value: transparent
                        - description: ''
                          label: Opaque
                          value: opaque
                        - description: ''
                          label: Automatically
                          value: auto
                  required:
                    - prompt
                  type: object
                                                  required:
                - model
                - input
              type: object
                                        example:
              model: gpt-image-2-5-flare-image-to-image
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Transform this product image into a premium e-commerce poster
                  style.
                input_urls:
                  - https://example.com/
                aspect_ratio: auto
                resolution: 4K
                background: transparent

=====

# Image Models > GPT Image > GPT Image 2.5 Sunburst - Text to Image
Fuente: https://docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-text-to-image.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: GPT Image 2.5 Sunburst - Text to Image
      description: >-
        ## Create Task

        Use this endpoint to create a new text-to-image generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: gpt-image-2-5-sunburst-text-to-image
      tags:
        - docs/en/Market/Image    Models/GPT Image
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: gpt-image-2-5-sunburst-text-to-image
                  description: >-
                    The model name used for generation. This field is required.
                    This endpoint must use the
                    `gpt-image-2-5-sunburst-text-to-image` model.
                  enum:
                    - gpt-image-2-5-sunburst-text-to-image
                  examples:
                    - gpt-image-2-5-sunburst-text-to-image
                  type: string
                                        name: ''
                      value: gpt-image-2-5-sunburst-text-to-image
                callBackUrl:
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent. To
                    ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification).
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the text-to-image task.
                  properties:
                    prompt:
                      description: Text prompt. Required, maximum 20,000 characters.
                      examples:
                        - >-
                          A cinematic night city poster with neon reflections on
                          a rainy street.
                      maxLength: 20000
                      minLength: 1
                      type: string
                    aspect_ratio:
                      description: >-
                        The aspect ratio of the generated image is set to auto
                        by default. The 27:16, 16:27, 9:8 and 8:9 aspect ratios
                        support 1K only. 2K and 4K are available for other
                        aspect ratios.
                      enum:
                        - auto
                        - '1:1'
                        - '3:2'
                        - '2:3'
                        - '4:3'
                        - '3:4'
                        - '16:9'
                        - '9:16'
                        - '21:9'
                        - '27:16'
                        - '16:27'
                        - '9:8'
                        - '8:9'
                      type: string
                                                label: auto
                          value: auto
                        - description: ''
                          label: '1:1'
                          value: '1:1'
                        - description: ''
                          label: '3:2'
                          value: '3:2'
                        - description: ''
                          label: '2:3'
                          value: '2:3'
                        - description: ''
                          label: '4:3'
                          value: '4:3'
                        - description: ''
                          label: '3:4'
                          value: '3:4'
                        - description: ''
                          label: '16:9'
                          value: '16:9'
                        - description: ''
                          label: '9:16'
                          value: '9:16'
                        - description: ''
                          label: '21:9'
                          value: '21:9'
                        - description: ''
                          name: ''
                          value: '27:16'
                        - description: ''
                          name: ''
                          value: '16:27'
                        - description: ''
                          name: ''
                          value: '9:8'
                        - description: ''
                          name: ''
                          value: '8:9'
                    resolution:
                      description: Image resolution
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      type: string
                                                name: ''
                          value: 1K
                        - description: ''
                          name: ''
                          value: 2K
                        - description: ''
                          name: ''
                          value: 4K
                    background:
                      description: 'Image background '
                      enum:
                        - transparent
                        - opaque
                        - auto
                      type: string
                                                name: Transparency
                          value: transparent
                        - description: ''
                          name: Opaque
                          value: opaque
                        - description: ''
                          name: Automatically
                          value: auto
                  required:
                    - prompt
                  type: object
                                                  required:
                - model
                - input
              type: object
                                        example:
              model: gpt-image-2-5-sunburst-text-to-image
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A cinematic night city poster with neon reflections on a rainy
                  street.
                aspect_ratio: '4:3'
                resolution: 2K
                background: opaque

=====

# Image Models > GPT Image > GPT Image 2.5 Sunburst - Image To Image
Fuente: https://docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-image-to-image.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: GPT Image 2.5 Sunburst - Image To Image
      description: >-
        ## Create Task

        Use this endpoint to create a new image-to-image generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
           
        </CardGroup>
      operationId: gpt-image-2-5-sunburst-image-to-image
      tags:
        - docs/en/Market/Image    Models/GPT Image
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: gpt-image-2-5-sunburst-image-to-image
                  description: >-
                    The model name used for generation. This field is required.
                    This endpoint must use the
                    `gpt-image-2-5-sunburst-image-to-image` model.
                  enum:
                    - gpt-image-2-5-sunburst-image-to-image
                  examples:
                    - gpt-image-2-5-sunburst-image-to-image
                  type: string
                callBackUrl:
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent. To
                    ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification).
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the image-to-image task.
                  properties:
                    prompt:
                      description: Text prompts, up to 20,000 characters.
                      examples:
                        - >-
                          Transform this product image into a premium e-commerce
                          poster style.
                      type: string
                    input_urls:
                      description: Array of input image URLs.
                      examples:
                        - - https://example.com/
                      items:
                        format: uri
                        type: string
                      maxItems: 16
                      type: array
                    aspect_ratio:
                      description: >-
                        The aspect ratio of the generated image is set to auto
                        by default. The 27:16, 16:27, 9:8 and 8:9 aspect ratios
                        support 1K only. 2K and 4K are available for other
                        aspect ratios.
                      enum:
                        - auto
                        - '1:1'
                        - '3:2'
                        - '2:3'
                        - '4:3'
                        - '3:4'
                        - '16:9'
                        - '9:16'
                        - '21:9'
                        - '27:16'
                        - '16:27'
                        - '9:8'
                        - '8:9'
                      type: string
                                                label: auto
                          value: auto
                        - description: ''
                          label: '1:1'
                          value: '1:1'
                        - description: ''
                          label: '3:2'
                          value: '3:2'
                        - description: ''
                          label: '2:3'
                          value: '2:3'
                        - description: ''
                          label: '4:3'
                          value: '4:3'
                        - description: ''
                          label: '3:4'
                          value: '3:4'
                        - description: ''
                          label: '5:4'
                          value: '5:4'
                        - description: ''
                          label: '4:5'
                          value: '4:5'
                        - description: ''
                          label: '16:9'
                          value: '16:9'
                        - description: ''
                          label: '9:16'
                          value: '9:16'
                        - description: ''
                          label: '2:1'
                          value: '2:1'
                        - description: ''
                          label: '1:2'
                          value: '1:2'
                        - description: ''
                          label: '3:1'
                          value: '3:1'
                        - description: ''
                          label: '1:3'
                          value: '1:3'
                        - description: ''
                          label: '21:9'
                          value: '21:9'
                        - description: ''
                          name: ''
                          value: '9:21'
                    resolution:
                      description: Image resolution
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      type: string
                                                name: ''
                          value: 1K
                        - description: ''
                          name: ''
                          value: 2K
                        - description: ''
                          name: ''
                          value: 4K
                    background:
                      description: Image background
                      enum:
                        - transparent
                        - opaque
                        - auto
                      type: string
                                                name: Transparency
                          value: transparent
                        - description: ''
                          name: Opaque
                          value: opaque
                        - description: ''
                          name: Automatically
                          value: auto
                  required:
                    - prompt
                  type: object
                                                  required:
                - model
                - input
              type: object
                                        example:
              model: gpt-image-2-5-sunburst-image-to-image
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Transform this product image into a premium e-commerce poster
                  style.
                input_urls:
                  - https://example.com/
                aspect_ratio: auto
                resolution: 4K
                background: opaque

=====

# Image Models > GPT Image > GPT Image-2 - Text to Image
Fuente: https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: GPT Image-2 - Text to Image
      description: >-
        ## Create Task

        Use this endpoint to create a new text-to-image generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: gpt-image-2-text-to-image
      tags:
        - docs/en/Market/Image    Models/GPT Image
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: gpt-image-2-text-to-image
                  description: >-
                    The model name used for generation. This field is required.
                    This endpoint must use the `gpt-image-2-text-to-image`
                    model.
                  enum:
                    - gpt-image-2-text-to-image
                  examples:
                    - gpt-image-2-text-to-image
                  type: string
                                        name: ''
                      value: gpt-image-2-text-to-image
                callBackUrl:
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent. To
                    ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification).
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the text-to-image task.
                  properties:
                    prompt:
                      description: Text prompt. Required, maximum 20,000 characters.
                      examples:
                        - >-
                          A cinematic night city poster with neon reflections on
                          a rainy street.
                      maxLength: 20000
                      minLength: 1
                      type: string
                    aspect_ratio:
                      description: >-
                        The aspect ratio of the generated image is set to auto
                        by default.

                        Note: for 2K resolution, the following aspect ratios are
                        not supported: 5:4, 4:5, 3:1, 1:3, and 9:21.

                        for 4K resolution, the following aspect ratios are not
                        supported: 3:1, 1:3, and 9:21.
                      enum:
                        - auto
                        - '1:1'
                        - '3:2'
                        - '2:3'
                        - '4:3'
                        - '3:4'
                        - '5:4'
                        - '4:5'
                        - '16:9'
                        - '9:16'
                        - '2:1'
                        - '1:2'
                        - '3:1'
                        - '1:3'
                        - '21:9'
                        - '9:21'
                      type: string
                                                label: auto
                          value: auto
                        - description: ''
                          label: '1:1'
                          value: '1:1'
                        - description: ''
                          label: '3:2'
                          value: '3:2'
                        - description: ''
                          label: '2:3'
                          value: '2:3'
                        - description: ''
                          label: '4:3'
                          value: '4:3'
                        - description: ''
                          label: '3:4'
                          value: '3:4'
                        - description: ''
                          label: '5:4'
                          value: '5:4'
                        - description: ''
                          label: '4:5'
                          value: '4:5'
                        - description: ''
                          label: '16:9'
                          value: '16:9'
                        - description: ''
                          label: '9:16'
                          value: '9:16'
                        - description: ''
                          label: '2:1'
                          value: '2:1'
                        - description: ''
                          label: '1:2'
                          value: '1:2'
                        - description: ''
                          label: '3:1'
                          value: '3:1'
                        - description: ''
                          label: '1:3'
                          value: '1:3'
                        - description: ''
                          label: '21:9'
                          value: '21:9'
                        - description: ''
                          name: ''
                          value: '9:21'
                    resolution:
                      description: >-
                        Output resolution: 1K, 2K or 4K. Set this field
                        explicitly. 2K does not support 5:4, 4:5, 3:1, 1:3 or
                        9:21; 4K does not support 3:1, 1:3 or 9:21. The
                        background parameter is only available at 1K.
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      type: string
                                                name: ''
                          value: 1K
                        - description: ''
                          name: ''
                          value: 2K
                        - description: ''
                          name: ''
                          value: 4K
                    background:
                      description: >-
                        Image background

                        Note: This parameter is only supported when the
                        resolution is 1K.
                      enum:
                        - transparent
                        - opaque
                        - auto
                      type: string
                                                name: ''
                          value: transparent
                        - description: Opaque
                          name: ''
                          value: opaque
                        - description: Automatically
                          name: ''
                          value: auto
                  required:
                    - prompt
                  type: object
                                                  required:
                - model
                - input
              type: object
                                        example:
              model: gpt-image-2-text-to-image
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A cinematic night city poster with neon reflections on a rainy
                  street.
                aspect_ratio: auto

=====

# Image Models > GPT Image > GPT Image 2 - Image To Image
Fuente: https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: GPT Image 2 - Image To Image
      description: >-
        ## Create Task

        Use this endpoint to create a new image-to-image generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: gpt-image-2-image-to-image
      tags:
        - docs/en/Market/Image    Models/GPT Image
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: gpt-image-2-image-to-image
                  description: >-
                    The model name used for generation. This field is required.
                    This endpoint must use the `gpt-image-2-image-to-image`
                    model.
                  enum:
                    - gpt-image-2-image-to-image
                  examples:
                    - gpt-image-2-image-to-image
                  type: string
                callBackUrl:
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent. To
                    ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification).
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the image-to-image task.
                  properties:
                    prompt:
                      description: Text prompts, up to 20,000 characters.
                      examples:
                        - >-
                          Transform this product image into a premium e-commerce
                          poster style.
                      type: string
                    input_urls:
                      description: Array of input image URLs.
                      examples:
                        - - https://example.com/
                      items:
                        format: uri
                        type: string
                      maxItems: 16
                      type: array
                    aspect_ratio:
                      description: >-
                        The aspect ratio of the generated image is set to auto
                        by default.

                        Note: for 2K resolution, the following aspect ratios are
                        not supported: 5:4, 4:5, 3:1, 1:3, and 9:21.

                        for 4K resolution, the following aspect ratios are not
                        supported: 3:1, 1:3, and 9:21.
                      enum:
                        - auto
                        - '1:1'
                        - '3:2'
                        - '2:3'
                        - '4:3'
                        - '3:4'
                        - '5:4'
                        - '4:5'
                        - '16:9'
                        - '9:16'
                        - '2:1'
                        - '1:2'
                        - '3:1'
                        - '1:3'
                        - '21:9'
                        - '9:21'
                      type: string
                                                label: auto
                          value: auto
                        - description: ''
                          label: '1:1'
                          value: '1:1'
                        - description: ''
                          label: '3:2'
                          value: '3:2'
                        - description: ''
                          label: '2:3'
                          value: '2:3'
                        - description: ''
                          label: '4:3'
                          value: '4:3'
                        - description: ''
                          label: '3:4'
                          value: '3:4'
                        - description: ''
                          label: '5:4'
                          value: '5:4'
                        - description: ''
                          label: '4:5'
                          value: '4:5'
                        - description: ''
                          label: '16:9'
                          value: '16:9'
                        - description: ''
                          label: '9:16'
                          value: '9:16'
                        - description: ''
                          label: '2:1'
                          value: '2:1'
                        - description: ''
                          label: '1:2'
                          value: '1:2'
                        - description: ''
                          label: '3:1'
                          value: '3:1'
                        - description: ''
                          label: '1:3'
                          value: '1:3'
                        - description: ''
                          label: '21:9'
                          value: '21:9'
                        - description: ''
                          name: ''
                          value: '9:21'
                    resolution:
                      description: >-
                        Output resolution: 1K, 2K or 4K. Set this field
                        explicitly. 2K does not support 5:4, 4:5, 3:1, 1:3 or
                        9:21; 4K does not support 3:1, 1:3 or 9:21. The
                        background parameter is only available at 1K.
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      type: string
                                                name: ''
                          value: 1K
                        - description: ''
                          name: ''
                          value: 2K
                        - description: ''
                          name: ''
                          value: 4K
                    background:
                      description: >-
                        Image background

                        Note: This parameter is only supported when the
                        resolution is 1K.
                      enum:
                        - transparent
                        - opaque
                        - auto
                      type: string
                                                name: ''
                          value: transparent
                        - description: Opaque
                          name: ''
                          value: opaque
                        - description: Automatically
                          name: ''
                          value: auto
                  required:
                    - prompt
                  type: object
                                                  required:
                - model
                - input
              type: object
                                        example:
              model: gpt-image-2-image-to-image
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: take a photo with Sam Altman in the conference room
                input_urls:
                  - >-
                    https://static.aiquickdraw.com/tools/example/1776782793756_wrogXTdd.png
                aspect_ratio: auto

=====

# Image Models > Topaz > Topaz - Image Upscale
Fuente: https://docs.kie.ai/market/topaz/image-upscale.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Topaz - Image Upscale
      description: >
        Enhance image resolution and quality using advanced AI upscaling powered
        by Topaz

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: topaz-image-upscale
      tags:
        - docs/en/Market/Image    Models/Topaz
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: topaz/image-upscale
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `topaz/image-upscale` for this endpoint
                  enum:
                    - topaz/image-upscale
                  examples:
                    - topaz/image-upscale
                  type: string
                callBackUrl:
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the generation task
                  properties:
                    image_url:
                      description: >-
                        Url of the image to be upscaled (File URL after upload,
                        not file content; Accepted types: image/jpeg, image/png,
                        image/webp; Max size: 10.0MB)
                      examples:
                        - >-
                          https://static.aiquickdraw.com/tools/example/1762752805607_mErUj1KR.png
                      type: string
                    upscale_factor:
                      default: '2'
                      description: >-
                        Factor to upscale the image by (e.g. 2 doubles width and
                        height).
                      enum:
                        - '1'
                        - '2'
                        - '4'
                      examples:
                        - '2'
                      type: string
                                                name: ''
                          value: '1'
                        - description: ''
                          name: ''
                          value: '2'
                        - description: ''
                          name: ''
                          value: '4'
                  required:
                    - image_url
                    - upscale_factor
                  type: object
                                                  required:
                - model
              type: object
                                        example:
              model: topaz/image-upscale
              callBackUrl: https://your-domain.com/api/callback
              input:
                image_url: >-
                  https://static.aiquickdraw.com/tools/example/1762752805607_mErUj1KR.png
                upscale_factor: '2'

=====

# Image Models > Recraft > Recraft - Remove Background
Fuente: https://docs.kie.ai/market/recraft/remove-background.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Recraft - Remove Background
      description: >
        remove background by recraft/remove-background

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: recraft-remove-background
      tags:
        - docs/en/Market/Image    Models/Recraft
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
              properties:
                model:
                  type: string
                  enum:
                    - recraft/remove-background
                  default: recraft/remove-background
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `recraft/remove-background` for this endpoint
                  examples:
                    - recraft/remove-background
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    image:
                      description: >-
                        Image to remove background from. Supported formats: PNG,
                        JPG, WEBP. Max 5MB, max 16MP, max dimension 4096px, min
                        dimension 256px. (File URL after upload, not file
                        content; Accepted types: image/jpeg, image/png,
                        image/webp; Max size: 5.0MB)
                      type: string
                      examples:
                        - >-
                          https://file.aiquickdraw.com/custom-page/akr/section-images/1757057285447k9qcbki1.webp
                  required:
                    - image
                                                                            example:
              model: recraft/remove-background
              callBackUrl: https://your-domain.com/api/callback
              input:
                image: >-
                  https://file.aiquickdraw.com/custom-page/akr/section-images/1757057285447k9qcbki1.webp

=====

# Image Models > Recraft > Recraft - Crisp Upscale
Fuente: https://docs.kie.ai/market/recraft/crisp-upscale.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Recraft - Crisp Upscale
      description: >
        Enhance image resolution and quality using advanced AI upscaling powered
        by Recraft

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: recraft-crisp-upscale
      tags:
        - docs/en/Market/Image    Models/Recraft
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
              properties:
                model:
                  type: string
                  enum:
                    - recraft/crisp-upscale
                  default: recraft/crisp-upscale
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `recraft/crisp-upscale` for this endpoint
                  examples:
                    - recraft/crisp-upscale
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    image:
                      description: >-
                        Image to upscale (File URL after upload, not file
                        content; Accepted types: image/jpeg, image/png,
                        image/webp; Max size: 10.0MB)
                      type: string
                      examples:
                        - >-
                          https://file.aiquickdraw.com/custom-page/akr/section-images/1757169577325ijj8vwvt.jpg
                  required:
                    - image
                                                                            example:
              model: recraft/crisp-upscale
              callBackUrl: https://your-domain.com/api/callback
              input:
                image: >-
                  https://file.aiquickdraw.com/custom-page/akr/section-images/1757169577325ijj8vwvt.jpg

=====

# Image Models > Ideogram > Ideogram V3 Text to Image
Fuente: https://docs.kie.ai/market/ideogram/v3-text-to-image.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Ideogram V3 Text to Image
      description: >
        Image generation by ideogram/v3-text-to-image

        Output format: WebP.

        ## Create Task

        Use this endpoint to create a new image generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: ideogram-v3-text-to-image
      tags:
        - docs/en/Market/Image    Models/Ideogram
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: ideogram/v3-text-to-image
                  description: >-
                    The model name used for generation. This field is required.

                    - This endpoint must use the `ideogram/v3-text-to-image`
                    model
                  enum:
                    - ideogram/v3-text-to-image
                  examples:
                    - ideogram/v3-text-to-image
                  type: string
                callBackUrl:
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent.
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the generation task.
                  properties:
                    prompt:
                      description: >-
                        Description of the image to generate. Maximum length:
                        5000 characters.
                      examples:
                        - >-
                          A cinematic photograph of a tranquil lakeside at
                          twilight, viewed from a slight elevation. In the
                          center, a cluster of softly glowing reeds and water
                          lilies emit a gentle golden light, their reflections
                          shimmering on the calm surface. The elegant neon-style
                          white text 'Kie.ai' hovers just above the water,
                          subtly illuminated and harmonizing with the natural
                          glow. Surrounding willows and drifting mist frame the
                          scene, creating a serene yet magical atmosphere, with
                          warm highlights contrasting against the cool blues of
                          the evening sky.
                      maxLength: 5000
                      type: string
                    rendering_speed:
                      description: |-
                        The rendering speed to use.

                        - `TURBO`: Turbo
                        - `BALANCED`: Balanced
                        - `QUALITY`: Quality
                      enum:
                        - TURBO
                        - BALANCED
                        - QUALITY
                      examples:
                        - BALANCED
                      type: string
                    style:
                      description: |-
                        The style type to generate with.

                        - `AUTO`: Auto
                        - `GENERAL`: General
                        - `REALISTIC`: Realistic
                        - `DESIGN`: Design
                      enum:
                        - AUTO
                        - GENERAL
                        - REALISTIC
                        - DESIGN
                      examples:
                        - AUTO
                      type: string
                    expand_prompt:
                      description: >-
                        Determines whether MagicPrompt should be used to enhance
                        the generation request.

                        - Boolean value: `true` / `false`
                      examples:
                        - true
                      type: boolean
                    image_size:
                      description: |-
                        The resolution of the generated image.

                        - `square`: Square
                        - `square_hd`: Square HD
                        - `portrait_4_3`: Portrait 3:4
                        - `portrait_16_9`: Portrait 9:16
                        - `landscape_4_3`: Landscape 4:3
                        - `landscape_16_9`: Landscape 16:9
                      enum:
                        - square
                        - square_hd
                        - portrait_4_3
                        - portrait_16_9
                        - landscape_4_3
                        - landscape_16_9
                      examples:
                        - square_hd
                      type: string
                    seed:
                      description: Seed for the random number generator.
                      type: integer
                    negative_prompt:
                      description: >-
                        Description of what to exclude from the generated image.
                        If the positive prompt conflicts with the negative
                        prompt, the positive prompt takes precedence. Maximum
                        length: 5000 characters.
                      maxLength: 5000
                      type: string
                  required:
                    - prompt
                  type: object
                                                  required:
                - model
                - input
              type: object
                                        example:
              model: ideogram/v3-text-to-image
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A cinematic photograph of a tranquil lakeside at twilight,
                  viewed from a slight elevation. In the center, a cluster of
                  softly glowing reeds and water lilies emit a gentle golden
                  light, their reflections shimmering on the calm surface. The
                  elegant neon-style white text 'Kie.ai' hovers just above the
                  water, subtly illuminated and harmonizing with the natural
                  glow. Surrounding willows and drifting mist frame the scene,
                  creating a serene yet magical atmosphere, with warm highlights
                  contrasting against the cool blues of the evening sky.
                rendering_speed: BALANCED
                style: AUTO
                expand_prompt: true
                image_size: square_hd
                seed: 123456
                negative_prompt: >-
                  blurry, low detail, distorted anatomy, extra limbs, malformed
                  text, watermark

=====

# Image Models > Ideogram > Ideogram V3 Edit
Fuente: https://docs.kie.ai/market/ideogram/v3-edit.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Ideogram V3 Edit
      description: >
        Image generation by ideogram/v3-edit

        Output format: WebP.

        ## Create Task

        Use this endpoint to create a new image editing generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: ideogram-v3-edit
      tags:
        - docs/en/Market/Image    Models/Ideogram
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - ideogram/v3-edit
                  default: ideogram/v3-edit
                  description: |-
                    The model name used for generation. This field is required.

                    - This endpoint must use the `ideogram/v3-edit` model
                  examples:
                    - ideogram/v3-edit
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent.
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the image editing task.
                  required:
                    - prompt
                    - image_url
                    - mask_url
                  properties:
                    prompt:
                      type: string
                      maxLength: 5000
                      description: >-
                        The prompt to fill the masked part of the image. Maximum
                        length: 5000 characters.
                      examples:
                        - A dog wearing a cowboy hat
                    image_url:
                      type: string
                      format: uri
                      description: >-
                        The image URL to generate an image from. Needs to match
                        the dimensions of the mask.

                        - Please provide the URL of the uploaded file, not raw
                        file content

                        - Accepted types: `image/jpeg`, `image/png`,
                        `image/webp`

                        - Max size: 10.0MB
                      examples:
                        - >-
                          https://file.aiquickdraw.com/custom-page/akr/section-images/1755076859801ryyol1du.webp
                    mask_url:
                      type: string
                      format: uri
                      description: >-
                        The mask URL to inpaint the image. Needs to match the
                        dimensions of the input image.

                        - Please provide the URL of the uploaded file, not raw
                        file content

                        - Accepted types: `image/jpeg`, `image/png`,
                        `image/webp`

                        - Max size: 10.0MB
                      examples:
                        - >-
                          https://file.aiquickdraw.com/custom-page/akr/section-images/1755076871089hx9uonhc.webp
                    rendering_speed:
                      type: string
                      enum:
                        - TURBO
                        - BALANCED
                        - QUALITY
                      default: BALANCED
                      description: |-
                        The rendering speed to use. Default value: `BALANCED`.

                        - `TURBO`: Turbo
                        - `BALANCED`: Balanced
                        - `QUALITY`: Quality
                      examples:
                        - BALANCED
                    expand_prompt:
                      type: boolean
                      default: true
                      description: >-
                        Determine if MagicPrompt should be used in generating
                        the request or not. Default value: `true`.

                        - Boolean value: `true` / `false`
                      examples:
                        - true
                    seed:
                      type: integer
                      description: Seed for the random number generator.
                                                                            example:
              model: ideogram/v3-edit
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: A dog wearing a cowboy hat
                image_url: >-
                  https://file.aiquickdraw.com/custom-page/akr/section-images/1755076859801ryyol1du.webp
                mask_url: >-
                  https://file.aiquickdraw.com/custom-page/akr/section-images/1755076871089hx9uonhc.webp
                rendering_speed: BALANCED
                expand_prompt: true
                seed: 123456

=====

# Image Models > Ideogram > Ideogram V3 Remix
Fuente: https://docs.kie.ai/market/ideogram/v3-remix.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Ideogram V3 Remix
      description: >
        Image generation by ideogram/v3-remix

        Output format: WebP.

        ## Create Task

        Use this endpoint to create a new image remix generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: ideogram-v3-remix
      tags:
        - docs/en/Market/Image    Models/Ideogram
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  default: ideogram/v3-remix
                  description: |-
                    The model name used for generation. This field is required.

                    - This endpoint must use the `ideogram/v3-remix` model
                  enum:
                    - ideogram/v3-remix
                  examples:
                    - ideogram/v3-remix
                  type: string
                callBackUrl:
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent.
                  examples:
                    - https://your-domain.com/api/callback
                  format: uri
                  type: string
                input:
                  description: Input parameters for the image remix task.
                  properties:
                    prompt:
                      description: >-
                        The prompt to remix the image with. Maximum length: 5000
                        characters.
                      examples:
                        - Change the cube into a sphere
                      maxLength: 5000
                      type: string
                    image_url:
                      description: >-
                        The image URL to remix.

                        - Please provide the URL of the uploaded file, not raw
                        file content

                        - Accepted types: `image/jpeg`, `image/png`,
                        `image/webp`

                        - Max size: 10.0MB
                      examples:
                        - >-
                          https://file.aiquickdraw.com/custom-page/akr/section-images/17550782013854ykfihxv.webp
                      format: uri
                      type: string
                    rendering_speed:
                      description: |-
                        The rendering speed to use.

                        - `TURBO`: Turbo
                        - `BALANCED`: Balanced
                        - `QUALITY`: Quality
                      enum:
                        - TURBO
                        - BALANCED
                        - QUALITY
                      examples:
                        - BALANCED
                      type: string
                    style:
                      description: |-
                        The style type to generate with.

                        - `AUTO`: Auto
                        - `GENERAL`: General
                        - `REALISTIC`: Realistic
                        - `DESIGN`: Design
                      enum:
                        - AUTO
                        - GENERAL
                        - REALISTIC
                        - DESIGN
                      examples:
                        - AUTO
                      type: string
                    expand_prompt:
                      description: >-
                        Determine if MagicPrompt should be used in generating
                        the request or not.

                        - Boolean value: `true` / `false`
                      examples:
                        - true
                      type: boolean
                    image_size:
                      description: |-
                        The resolution of the generated image.

                        - `square`: Square
                        - `square_hd`: Square HD
                        - `portrait_4_3`: Portrait 3:4
                        - `portrait_16_9`: Portrait 9:16
                        - `landscape_4_3`: Landscape 4:3
                        - `landscape_16_9`: Landscape 16:9
                      enum:
                        - square
                        - square_hd
                        - portrait_4_3
                        - portrait_16_9
                        - landscape_4_3
                        - landscape_16_9
                      examples:
                        - square_hd
                      type: string
                    num_images:
                      description: |-
                        Number of images to generate.

                        - `1`: 1 image
                        - `2`: 2 images
                        - `3`: 3 images
                        - `4`: 4 images
                      enum:
                        - '1'
                        - '2'
                        - '3'
                        - '4'
                      examples:
                        - '1'
                      type: string
                    seed:
                      description: Seed for the random number generator.
                      type: integer
                    strength:
                      description: |-
                        Strength of the input image in the remix.

                        - Minimum: `0.01`
                        - Maximum: `1`
                        - Step: `0.01`
                      examples:
                        - 0.8
                      maximum: 1
                      minimum: 0.01
                      type: number
                    negative_prompt:
                      description: >-
                        Description of what to exclude from the generated image.
                        If the positive prompt conflicts with the negative
                        prompt, the positive prompt takes precedence. Maximum
                        length: 5000 characters.
                      maxLength: 5000
                      type: string
                  required:
                    - prompt
                    - image_url
                  type: object
                                                  required:
                - model
                - input
              type: object
                                        example:
              model: ideogram/v3-remix
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: Change the cube into a sphere
                image_url: >-
                  https://file.aiquickdraw.com/custom-page/akr/section-images/17550782013854ykfihxv.webp
                rendering_speed: BALANCED
                style: AUTO
                expand_prompt: true
                image_size: square_hd
                num_images: '1'
                seed: 123456
                strength: 0.8
                negative_prompt: blurry, low quality, distorted, watermark

=====
